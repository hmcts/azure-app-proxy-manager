export type SAMLConfig = {
  optionalClaims: [{ name: string; additionalProperties: Array<String> }];
  groupMembershipClaims: string;
};
