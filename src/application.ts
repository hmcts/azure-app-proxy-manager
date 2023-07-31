import { SAMLConfig } from "./SAMLConfig.js";
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
  redirectUrls: Array<string>;
  preferredSingleSignOnMode: string;
  samlConfig: SAMLConfig;
  oauth2Permissions: Array<string>;
  clientSecret: ClientSecret;
};
