// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export class TreatmentVariables {
  public static readonly VSCodeConfig = "vscode";
  public static readonly ContextProvider = "contextProvider";
}

export class TreatmentVariableValue {
  // If this is true, user will see a different display title/description
  // for notification/command/workflow bot during scaffolding.
  public static contextProvider: boolean | undefined = undefined;
}
