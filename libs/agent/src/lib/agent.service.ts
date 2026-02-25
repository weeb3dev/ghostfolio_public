import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { type StructuredToolInterface } from '@langchain/core/tools';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { Langfuse } from 'langfuse';

import { createAgentGraph } from './agent.graph';
import {
  createAssetLookupTool,
  createPortfolioSummaryTool,
  createRebalanceSuggestionTool,
  createRiskAssessmentTool,
  createTransactionAnalysisTool
} from './tools';

export interface AgentChatResponse {
  response: string;
  toolCalls: string[];
  tokensUsed: number;
  confidence: string;
  latencyMs: number;
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private agentGraph: ReturnType<typeof createAgentGraph> | null = null;
  private langfuse: Langfuse | null = null;

  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly orderService: OrderService,
    private readonly dataProviderService: DataProviderService
  ) {}

  public onModuleInit() {
    const tools: StructuredToolInterface[] = [
      createPortfolioSummaryTool(this.portfolioService),
      createTransactionAnalysisTool(this.orderService),
      createAssetLookupTool(this.dataProviderService),
      createRiskAssessmentTool(this.portfolioService),
      createRebalanceSuggestionTool(this.portfolioService)
    ];

    this.agentGraph = createAgentGraph(tools);

    if (
      process.env['LANGFUSE_PUBLIC_KEY'] &&
      process.env['LANGFUSE_SECRET_KEY']
    ) {
      this.langfuse = new Langfuse({
        publicKey: process.env['LANGFUSE_PUBLIC_KEY'],
        secretKey: process.env['LANGFUSE_SECRET_KEY']
      });
      this.logger.log('Langfuse observability initialized');
    } else {
      this.logger.warn(
        'Langfuse keys not configured — observability disabled'
      );
    }

    this.logger.log(
      `Agent initialized with ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`
    );
  }

  public async chat(
    userId: string,
    message: string,
    history: BaseMessage[] = []
  ): Promise<AgentChatResponse> {
    if (!this.agentGraph) {
      throw new Error('Agent graph not initialized');
    }

    const startTime = Date.now();
    const trace = this.langfuse?.trace({
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

      const result = await this.agentGraph.invoke({
        messages
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const responseText =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      const toolCalls = result.messages
        .filter((m: BaseMessage) => m.getType() === 'tool')
        .map((m: BaseMessage) => m.name ?? 'unknown');

      const confidenceMatch =
        /\[Confidence:\s*(Low|Medium|High)\]/i.exec(responseText);
      const confidence = confidenceMatch
        ? confidenceMatch[1].toLowerCase()
        : 'medium';

      const latencyMs = Date.now() - startTime;

      trace?.update({
        output: { response: responseText, toolCalls, confidence },
        metadata: { latencyMs, toolCalls }
      });

      trace?.score({
        name: 'latency_ms',
        value: latencyMs
      });

      this.logger.log(
        `Chat completed — user=${userId} tools=[${toolCalls.join(',')}] confidence=${confidence} latency=${latencyMs}ms`
      );

      return {
        response: responseText,
        toolCalls,
        tokensUsed: 0,
        confidence,
        latencyMs
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
      await this.langfuse?.flushAsync();
    }
  }
}
