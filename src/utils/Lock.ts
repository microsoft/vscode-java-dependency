// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import AwaitLock from "await-lock";

export const explorerLock: AwaitLock = new AwaitLock();
