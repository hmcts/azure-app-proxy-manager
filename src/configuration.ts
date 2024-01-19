import yaml from "js-yaml";
import { promises as fsPromises } from "fs";
import { Application } from "./application.js";

// TODO merge with config
export function defaultOnPremisesFlags(): {
  isHttpOnlyCookieEnabled: boolean;
  isOnPremPublishingEnabled: boolean;
  isPersistentCookieEnabled: boolean;
  isSecureCookieEnabled: boolean;
  isTranslateHostHeaderEnabled: boolean;
  isTranslateLinksInBodyEnabled: boolean;
} {
  return {
    isHttpOnlyCookieEnabled: true,
    isOnPremPublishingEnabled: true,
    isPersistentCookieEnabled: true,
    isSecureCookieEnabled: true,
    isTranslateHostHeaderEnabled: true,
    isTranslateLinksInBodyEnabled: false,
  };
}

export async function loadApps(configFilePath: string): Promise<Application[]> {
  const file = await fsPromises.readFile(configFilePath, "utf8");
  const yamlApps: any = yaml.load(file);
  return yamlApps.apps.map((app: any) => {
    const application: Application = {
      name: app.name,
      logoUrl: app.logoUrl,
      tls: app.tls,
      preferredSingleSignOnMode: app.preferredSingleSignOnMode,
      redirectUrls:
        app.redirectUrls === undefined ? [app.externalUrl] : app.redirectUrls,
      identifierUrls:
        app.identifierUrls === undefined
          ? [app.externalUrl]
          : app.identifierUrls,
      appRoleAssignmentRequired:
        app.userAssignmentRequired === undefined
          ? true
          : app.userAssignmentRequired,
      appRoleAssignments:
        app.appRoleAssignments === undefined ? [] : app.appRoleAssignments,

      onPremisesPublishing: {
        externalUrl: app.externalUrl,
        internalUrl: app.internalUrl,
        externalAuthenticationType: app.externalAuthenticationType
          ? app.externalAuthenticationType
          : "aadPreAuthentication",
        ...defaultOnPremisesFlags(),
      },
      groupMembershipClaims: app.groupMembershipClaims,
      optionalClaims: app.optionalClaims,
      graphApiPermissions: app.graphApiPermissions,
      appRoles: app.appRoles,
      clientSecret: app.clientSecret,
      hideApp: app.hideApp,
    };
    return application;
  });
}
