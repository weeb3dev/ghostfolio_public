export interface ToolCallResult {
  toolName: string;
  result: string;
}

export interface NumberMatch {
  value: number;
  raw: string;
  index: number;
}

export interface HallucinationCheckResult {
  isValid: boolean;
  unsupportedClaims: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface DomainConstraintResult {
  passed: boolean;
  violations: string[];
  missingElements: string[];
}

export interface VerificationResult {
  hallucination: HallucinationCheckResult;
  domainConstraint: DomainConstraintResult;
  verified: boolean;
}
