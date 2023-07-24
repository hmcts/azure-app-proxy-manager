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
};
