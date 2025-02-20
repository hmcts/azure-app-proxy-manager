import { getEntraGroupId } from "./servicePrincipalManager";
import { expect, describe, test, beforeAll, afterEach } from "vitest";
import { authenticate } from "./testUtils";

describe("servicePrincipalManager", () => {
  let token: string;

  beforeAll(async () => {
    token = await authenticate();
  });

  test("getEntraGroupId group exists", async () => {
    const groupId = await getEntraGroupId("test_group_A", token);
    expect(groupId).toEqual("42912662-6e7b-4682-968d-c5d4c22a8aec");
  });

  test("getEntraGroupId group does not exist", async () => {
    expect(() => getEntraGroupId("does_not_exist", token)).rejects.toThrowError(
      "Error finding group id, does the group does_not_exist exist?",
    );
  });
});
