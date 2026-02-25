import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
