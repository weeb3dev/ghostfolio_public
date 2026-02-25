import { AgentModule } from '@ghostfolio/agent/agent.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { AgentController } from './agent.controller';

@Module({
  controllers: [AgentController],
  imports: [AgentModule, PrismaModule]
})
export class AgentEndpointModule {}
