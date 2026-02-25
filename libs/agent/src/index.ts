export { AgentModule } from './lib/agent.module';
export { AgentService } from './lib/agent.service';
export type { AgentChatResponse } from './lib/agent.service';
export type {
  DomainConstraintResult,
  HallucinationCheckResult,
  ToolCallResult,
  VerificationResult
} from './lib/verification';
export {
  DomainConstraintChecker,
  HallucinationDetector
} from './lib/verification';
