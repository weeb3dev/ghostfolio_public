import { AgentService } from '@ghostfolio/agent/agent.service';
import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  AgentChatMessageItem,
  AgentChatResponse,
  AgentConversationItem
} from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';

import { AgentChatDto } from './agent-chat.dto';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  public constructor(
    private readonly agentService: AgentService,
    private readonly prismaService: PrismaService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @HasPermission(permissions.accessAgentChat)
  @Post('chat')
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chat(
    @Body() { message, conversationId }: AgentChatDto
  ): Promise<AgentChatResponse> {
    const userId = this.request.user.id;
    const resolvedConversationId = conversationId ?? randomUUID();

    try {
      const existingMessages = await this.prismaService.chatMessage.findMany({
        where: { conversationId: resolvedConversationId, userId },
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true }
      });

      const history: BaseMessage[] = existingMessages.map((msg) =>
        msg.role === 'user'
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      );

      await this.prismaService.chatMessage.create({
        data: {
          conversationId: resolvedConversationId,
          content: message,
          role: 'user',
          userId
        }
      });

      const result = await this.agentService.chat(userId, message, history);

      await this.prismaService.chatMessage.create({
        data: {
          conversationId: resolvedConversationId,
          content: result.response,
          confidence: result.confidence,
          role: 'assistant',
          toolCalls: result.toolCalls,
          tokensUsed: result.tokensUsed,
          userId
        }
      });

      return {
        response: result.response,
        conversationId: resolvedConversationId,
        toolsUsed: result.toolCalls,
        confidence: result.confidence,
        verified: result.verified
      };
    } catch (error) {
      this.logger.error(
        `Agent chat failed for user=${userId}: ${error instanceof Error ? error.message : String(error)}`
      );

      throw new HttpException(
        getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR),
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }
  }

  @HasPermission(permissions.accessAgentChat)
  @Get('conversations')
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getConversations(): Promise<AgentConversationItem[]> {
    const userId = this.request.user.id;

    const conversations = await this.prismaService.chatMessage.groupBy({
      by: ['conversationId'],
      where: { userId },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } }
    });

    const conversationIds = conversations.map((c) => c.conversationId);

    const previews = await this.prismaService.chatMessage.findMany({
      where: {
        conversationId: { in: conversationIds },
        userId,
        role: 'user'
      },
      orderBy: { createdAt: 'asc' },
      distinct: ['conversationId'],
      select: { conversationId: true, content: true }
    });

    const previewMap = new Map(
      previews.map((p) => [p.conversationId, p.content])
    );

    return conversations.map((c) => ({
      conversationId: c.conversationId,
      lastMessageAt: c._max.createdAt?.toISOString() ?? '',
      messageCount: c._count.id,
      preview: (previewMap.get(c.conversationId) ?? '').slice(0, 100)
    }));
  }

  @HasPermission(permissions.accessAgentChat)
  @Get('conversations/:conversationId')
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getConversation(
    @Param('conversationId') conversationId: string
  ): Promise<AgentChatMessageItem[]> {
    const userId = this.request.user.id;

    const messages = await this.prismaService.chatMessage.findMany({
      where: { conversationId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        confidence: true,
        createdAt: true
      }
    });

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      toolCalls: Array.isArray(msg.toolCalls)
        ? (msg.toolCalls as string[])
        : undefined,
      confidence: msg.confidence ?? undefined,
      createdAt: msg.createdAt.toISOString()
    }));
  }
}
