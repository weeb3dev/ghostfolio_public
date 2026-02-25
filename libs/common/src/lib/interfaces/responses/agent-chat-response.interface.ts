export interface AgentChatResponse {
  response: string;
  conversationId: string;
  toolsUsed: string[];
  confidence: string;
}

export interface AgentChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
  confidence?: string;
  createdAt: string;
}

export interface AgentConversationItem {
  conversationId: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
}
