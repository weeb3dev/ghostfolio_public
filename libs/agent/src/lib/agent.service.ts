import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { Injectable, Logger } from '@nestjs/common';
import { type StructuredToolInterface } from '@langchain/core/tools';
import {
  HumanMessage,
  isAIMessage,
  type BaseMessage
} from '@langchain/core/messages';
import { Langfuse } from 'langfuse';

import { createAgentGraph } from './agent.graph';
import {
  createAssetLookupTool,
  createPortfolioSummaryTool,
  createRebalanceSuggestionTool,
  createRiskAssessmentTool,
  createTransactionAnalysisTool
} from './tools';
import {
  DomainConstraintChecker,
  HallucinationDetector
} from './verification';
import type { ToolCallResult, VerificationResult } from './verification';

const DOMAIN_VIOLATION_FALLBACK =
  'I can only provide factual portfolio analysis, not investment advice. Please rephrase your question to ask about specific portfolio data or metrics.';

const HALLUCINATION_WARNING =
  '\n\n⚠️ Note: Some figures in this response could not be verified against the source data. Please verify independently.';

let langfuseSingleton: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (langfuseSingleton) return langfuseSingleton;
  if (
    process.env['LANGFUSE_PUBLIC_KEY'] &&
    process.env['LANGFUSE_SECRET_KEY']
  ) {
    langfuseSingleton = new Langfuse({
      publicKey: process.env['LANGFUSE_PUBLIC_KEY'],
      secretKey: process.env['LANGFUSE_SECRET_KEY']
    });
  }
  return langfuseSingleton;
}

export interface AgentChatResponse {
  response: string;
  toolCalls: string[];
  tokensUsed: number;
  confidence: string;
  latencyMs: number;
  verified: boolean;
}

const AGENT_MODEL = 'claude-sonnet-4-20250514';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function extractTokenUsage(messages: BaseMessage[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;

  for (const msg of messages) {
    if (!isAIMessage(msg)) continue;
    const usage = msg.usage_metadata;
    if (usage) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
    }
  }

  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly orderService: OrderService,
    private readonly dataProviderService: DataProviderService
  ) {}

  private buildGraph(userId: string) {
    const tools: StructuredToolInterface[] = [
      createPortfolioSummaryTool(this.portfolioService),
      createTransactionAnalysisTool(this.orderService),
      createAssetLookupTool(this.dataProviderService),
      createRiskAssessmentTool(this.portfolioService),
      createRebalanceSuggestionTool(this.portfolioService)
    ];

    this.logger.log(
      `Building agent graph with ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`
    );

    return createAgentGraph(tools, userId);
  }

  public async chat(
    userId: string,
    message: string,
    history: BaseMessage[] = []
  ): Promise<AgentChatResponse> {
    const agentGraph = this.buildGraph(userId);
    const langfuse = getLangfuse();

    const startTime = Date.now();
    const trace = langfuse?.trace({
      name: 'agent-chat',
      userId,
      input: { message },
      metadata: { historyLength: history.length }
    });

    try {
      const messages: BaseMessage[] = [
        ...history,
        new HumanMessage(message)
      ];

      const result = await agentGraph.invoke({
        messages
      });

      const lastMessage = result.messages[result.messages.length - 1];
      let responseText =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      const toolMessages = result.messages.filter(
        (m: BaseMessage) => m.getType() === 'tool'
      );

      const toolCalls = toolMessages.map(
        (m: BaseMessage) => m.name ?? 'unknown'
      );

      const toolResults: ToolCallResult[] = toolMessages.map(
        (m: BaseMessage) => ({
          toolName: m.name ?? 'unknown',
          result:
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content)
        })
      );

      // --- Verification layer ---
      const hallucinationResult = HallucinationDetector.check(
        responseText,
        toolResults
      );
      const domainResult = DomainConstraintChecker.check(responseText);

      let confidence: string;
      let verified = true;

      if (domainResult.violations.length > 0) {
        this.logger.warn(
          `Domain constraint violated — user=${userId} violations=[${domainResult.violations.join('; ')}]`
        );
        responseText = DOMAIN_VIOLATION_FALLBACK;
        confidence = 'low';
        verified = false;
      } else if (!hallucinationResult.isValid) {
        this.logger.warn(
          `Hallucination detected — user=${userId} claims=[${hallucinationResult.unsupportedClaims.join('; ')}]`
        );
        responseText += HALLUCINATION_WARNING;
        confidence = 'low';
        verified = false;
      } else {
        const confidenceMatch =
          /\[Confidence:\s*(Low|Medium|High)\]/i.exec(responseText);
        confidence = confidenceMatch
          ? confidenceMatch[1].toLowerCase()
          : 'medium';
      }

      const verification: VerificationResult = {
        hallucination: hallucinationResult,
        domainConstraint: domainResult,
        verified
      };

      const tokenUsage = extractTokenUsage(result.messages);
      const latencyMs = Date.now() - startTime;

      trace?.update({
        output: { response: responseText, toolCalls, confidence, verified },
        metadata: { latencyMs, toolCalls }
      });

      trace?.generation({
        name: 'llm',
        model: AGENT_MODEL,
        input: messages.map((m) => ({
          role: m.getType(),
          content:
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content)
        })),
        output: responseText,
        usage: {
          input: tokenUsage.inputTokens,
          output: tokenUsage.outputTokens,
          total: tokenUsage.totalTokens
        }
      });

      trace?.span({
        name: 'verification',
        input: {
          responseLength: responseText.length,
          toolResultCount: toolResults.length
        },
        output: verification
      });

      trace?.score({
        name: 'latency_ms',
        value: latencyMs
      });

      trace?.score({
        name: 'verification_passed',
        value: verified ? 1 : 0
      });

      this.logger.log(
        `Chat completed — user=${userId} tools=[${toolCalls.join(',')}] tokens=${tokenUsage.totalTokens} confidence=${confidence} verified=${verified} latency=${latencyMs}ms`
      );

      return {
        response: responseText,
        toolCalls,
        tokensUsed: tokenUsage.totalTokens,
        confidence,
        latencyMs,
        verified
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      trace?.update({
        output: {
          error:
            error instanceof Error ? error.message : String(error)
        },
        metadata: { latencyMs, error: true }
      });

      this.logger.error(
        `Chat failed — user=${userId} error=${error instanceof Error ? error.message : String(error)} latency=${latencyMs}ms`
      );

      throw error;
    } finally {
      await langfuse?.flushAsync();
    }
  }
}
