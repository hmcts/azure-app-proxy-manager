import { AppRoles } from "./applicationManager.js";
import { ClientSecret } from "./clientSecret.js";
import { OnPremisesPublishing } from "./onPremisesPublishing.js";
import { TLS } from "./tls.js";

export type Application = {
  name: string;
  appRoleAssignmentRequired: boolean;
  logoUrl: string;
  appRoleAssignments: string[];
  onPremisesPublishing: OnPremisesPublishing;
  tls: TLS;
  preferredSingleSignOnMode: string;
  redirectUrls: Array<string>;
  identifierUrls: Array<string>;
  optionalClaims: [{ name: string; additionalProperties: Array<String> }];
  groupMembershipClaims: string;
  graphApiPermissions: Array<string>;
  appRoles: AppRoles;
  clientSecret: ClientSecret;
  hideApp: boolean;
};
