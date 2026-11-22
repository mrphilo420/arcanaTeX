const LatexTools = ()=>{
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "insert_latex",
        description: "Insert LaTeX code at the current cursor position in the document",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("The LaTeX code to insert at the cursor position")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ code }, { toolCallId })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const activeFile = state.files.find({
                    "LatexTools.useAssistantTool.activeFile": (file)=>file.id === state.activeFileId
                }["LatexTools.useAssistantTool.activeFile"]);
                if (!activeFile || activeFile.type !== "tex") {
                    return {
                        success: false,
                        error: "No editable LaTeX file is open."
                    };
                }
                const before = activeFile.content ?? "";
                const cursor = Math.min(Math.max(0, state.cursorPosition), before.length);
                const normalizedCode = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(code);
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyAgentEdit"])({
                    turnId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$agent$2d$changes$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentAgentTurnId"])(),
                    toolCallId,
                    fileId: activeFile.id,
                    before,
                    after: before.slice(0, cursor) + code + before.slice(cursor),
                    applied: [
                        {
                            start: cursor,
                            end: cursor + normalizedCode.length,
                            before: "",
                            after: normalizedCode
                        }
                    ]
                });
                if (!result.ok) {
                    return {
                        success: false,
                        error: result.reason === "conflict" ? "The file changed while the edit was being prepared. Re-read it and try again." : "The active file is no longer available."
                    };
                }
                state.setCursorPosition(cursor + code.length);
                return {
                    success: true,
                    message: "Code inserted at cursor position"
                };
            }
        }["LatexTools.useAssistantTool"],
        render: function InsertLatexRender({ result }) {
            const isComplete = result != null;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm",
                children: [
                    isComplete ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {
                        className: "size-4 text-green-600"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 84,
                        columnNumber: 13
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LoaderIcon$3e$__["LoaderIcon"], {
                        className: "size-4 animate-spin text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 86,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PlusIcon$3e$__["PlusIcon"], {
                        className: "size-4 text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 88,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-muted-foreground",
                        children: isComplete ? "Inserted LaTeX code" : "Inserting LaTeX code..."
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 89,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                lineNumber: 82,
                columnNumber: 9
            }, this);
        }
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "replace_selection",
        description: "Replace the currently selected text in the document with LaTeX code",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("The LaTeX code to replace the selection with")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ code }, { toolCallId })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const range = state.selectionRange;
                if (!range) {
                    return {
                        success: false,
                        error: "No text is currently selected in the editor"
                    };
                }
                const activeFile = state.files.find({
                    "LatexTools.useAssistantTool.activeFile": (file)=>file.id === state.activeFileId
                }["LatexTools.useAssistantTool.activeFile"]);
                if (!activeFile || activeFile.type !== "tex") {
                    return {
                        success: false,
                        error: "No editable LaTeX file is open."
                    };
                }
                const before = activeFile.content ?? "";
                const start = Math.min(Math.max(0, range.start), before.length);
                const end = Math.min(Math.max(start, range.end), before.length);
                const normalizedCode = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(code);
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyAgentEdit"])({
                    turnId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$agent$2d$changes$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentAgentTurnId"])(),
                    toolCallId,
                    fileId: activeFile.id,
                    before,
                    after: before.slice(0, start) + code + before.slice(end),
                    applied: [
                        {
                            start,
                            end: start + normalizedCode.length,
                            before: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(before.slice(start, end)),
                            after: normalizedCode
                        }
                    ]
                });
                if (!result.ok) {
                    return {
                        success: false,
                        error: result.reason === "conflict" ? "The file changed while the edit was being prepared. Re-read it and try again." : "The active file is no longer available."
                    };
                }
                state.setCursorPosition(start + code.length);
                return {
                    success: true,
                    message: "Selection replaced with code"
                };
            }
        }["LatexTools.useAssistantTool"],
        render: function ReplaceSelectionRender({ result }) {
            const isComplete = result != null;
            const hasError = result?.success === false;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm",
                children: [
                    isComplete ? hasError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "size-4 text-amber-600",
                        children: "!"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 161,
                        columnNumber: 15
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {
                        className: "size-4 text-green-600"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 163,
                        columnNumber: 15
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LoaderIcon$3e$__["LoaderIcon"], {
                        className: "size-4 animate-spin text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 166,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$replace$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ReplaceIcon$3e$__["ReplaceIcon"], {
                        className: "size-4 text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 168,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-muted-foreground",
                        children: hasError ? result.error : isComplete ? "Replaced selection" : "Replacing selection..."
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 169,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                lineNumber: 158,
                columnNumber: 9
            }, this);
        }
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "find_and_replace",
        description: "Find and replace text in a project file (the active file unless path is given). The find text must match exactly one place unless replaceAll is set; if it matches several, add contextBefore/contextAfter to pick one.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            find: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("The exact text to find in the file"),
            replace: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("The text to replace it with"),
            path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional().describe("Relative path of the file to edit. Omit to edit the active file."),
            replaceAll: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().optional().describe("Set true to replace every match of find. Otherwise the match must be unique."),
            contextBefore: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional().describe("Text immediately before find, used to disambiguate when find appears more than once."),
            contextAfter: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional().describe("Text immediately after find, used to disambiguate when find appears more than once.")
        }),
        execute: {
            "LatexTools.useAssistantTool": async (input, { toolCallId })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const plan = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$edit$2d$requests$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["planFindAndReplace"])(state.files, state.activeFileId, input);
                if (!plan.success) {
                    return {
                        success: false,
                        error: plan.error
                    };
                }
                const file = state.files.find({
                    "LatexTools.useAssistantTool.file": (candidate)=>candidate.id === plan.fileId
                }["LatexTools.useAssistantTool.file"]);
                if (!file) {
                    return {
                        success: false,
                        error: "The target file no longer exists."
                    };
                }
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyAgentEdit"])({
                    turnId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$agent$2d$changes$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentAgentTurnId"])(),
                    toolCallId,
                    fileId: plan.fileId,
                    before: file.content ?? "",
                    after: plan.newContent,
                    applied: plan.applied
                });
                if (!result.ok) {
                    return {
                        success: false,
                        error: result.reason === "conflict" ? "The file changed while the edit was being prepared. Re-read it and try again." : "The target file no longer exists."
                    };
                }
                return {
                    success: true,
                    message: `Replaced ${plan.replacements} occurrence${plan.replacements === 1 ? "" : "s"} in ${plan.filePath}`,
                    replacements: plan.replacements
                };
            }
        }["LatexTools.useAssistantTool"],
        render: function FindAndReplaceRender({ result }) {
            const isComplete = result != null;
            const hasError = result?.success === false;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "my-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm",
                children: [
                    isComplete ? hasError ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "size-4 text-amber-600",
                        children: "!"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 262,
                        columnNumber: 15
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckIcon$3e$__["CheckIcon"], {
                        className: "size-4 text-green-600"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 264,
                        columnNumber: 15
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__LoaderIcon$3e$__["LoaderIcon"], {
                        className: "size-4 animate-spin text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 267,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SearchIcon$3e$__["SearchIcon"], {
                        className: "size-4 text-muted-foreground"
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 269,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-muted-foreground",
                        children: hasError ? result.error : isComplete ? "Text replaced" : "Finding and replacing..."
                    }, void 0, false, {
                        fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                        lineNumber: 270,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/apps/web/components/workspace/editor/latex-tools.tsx",
                lineNumber: 259,
                columnNumber: 9
            }, this);
        }
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "list_project_files",
        description: "List every file in the current LaTeX project with its relative path, file type, and whether it is the main document or the active file.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({}),
        execute: {
            "LatexTools.useAssistantTool": async ()=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                return {
                    success: true,
                    mainDocument: state.files.find({
                        "LatexTools.useAssistantTool": (file)=>file.id === state.mainFileId
                    }["LatexTools.useAssistantTool"])?.path ?? null,
                    files: state.files.map({
                        "LatexTools.useAssistantTool": (file)=>({
                                path: file.path,
                                type: file.type,
                                main: file.id === state.mainFileId,
                                active: file.id === state.activeFileId
                            })
                    }["LatexTools.useAssistantTool"])
                };
            }
        }["LatexTools.useAssistantTool"]
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "read_project_file",
        description: "Read a text file from the project by its relative path. Use list_project_files first if you do not know the path.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("Relative file path, for example chapters/intro.tex")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ path })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const normalized = path.replace(/^\/+/, "");
                const file = state.files.find({
                    "LatexTools.useAssistantTool.file": (candidate)=>candidate.path === normalized || candidate.name === normalized
                }["LatexTools.useAssistantTool.file"]);
                if (!file) {
                    return {
                        success: false,
                        error: `File not found: ${normalized}`,
                        files: state.files.map({
                            "LatexTools.useAssistantTool": (candidate)=>candidate.path
                        }["LatexTools.useAssistantTool"])
                    };
                }
                if (file.type !== "tex") {
                    return {
                        success: true,
                        path: file.path,
                        type: file.type,
                        note: "This is a binary file. Its content is not available as text."
                    };
                }
                return {
                    success: true,
                    path: file.path,
                    type: file.type,
                    content: file.content ?? ""
                };
            }
        }["LatexTools.useAssistantTool"]
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "search_project",
        description: "Search for text across all editable files in the project. Returns matching file paths and context snippets.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            query: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("Text to search for, case-insensitive")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ query })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const needle = query.trim().toLowerCase();
                if (!needle) {
                    return {
                        success: false,
                        error: "Search query is empty"
                    };
                }
                const matches = [];
                for (const file of state.files){
                    if (file.type !== "tex" || !file.content) continue;
                    const index = file.content.toLowerCase().indexOf(needle);
                    if (index === -1) continue;
                    const start = Math.max(0, index - 120);
                    const end = Math.min(file.content.length, index + query.length + 180);
                    matches.push({
                        path: file.path,
                        snippet: file.content.slice(start, end)
                    });
                }
                return {
                    success: true,
                    query,
                    matchCount: matches.length,
                    matches: matches.slice(0, 20),
                    truncated: matches.length > 20
                };
            }
        }["LatexTools.useAssistantTool"]
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "write_project_file",
        description: "Create a new text file or overwrite an existing text file in the project. Use relative paths such as sections/methods.tex. Provide the complete file content.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("Relative path for the file, for example sections/new.tex"),
            content: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("The complete text content for the file")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ path, content }, { toolCallId })=>{
                const turnId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$agent$2d$changes$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentAgentTurnId"])();
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const normalized = path.replace(/^\/+/, "").trim();
                if (!normalized || normalized.includes("..")) {
                    return {
                        success: false,
                        error: "Invalid file path"
                    };
                }
                const existing = state.files.find({
                    "LatexTools.useAssistantTool.existing": (file)=>file.path === normalized
                }["LatexTools.useAssistantTool.existing"]);
                if (existing) {
                    if (existing.type !== "tex") {
                        return {
                            success: false,
                            error: `Cannot overwrite binary file: ${normalized}`
                        };
                    }
                    const normalizedAfter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(content);
                    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyAgentEdit"])({
                        turnId,
                        toolCallId,
                        fileId: existing.id,
                        before: existing.content ?? "",
                        after: content,
                        applied: [
                            {
                                start: 0,
                                end: normalizedAfter.length,
                                before: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(existing.content ?? ""),
                                after: normalizedAfter
                            }
                        ]
                    });
                    if (!result.ok) {
                        return {
                            success: false,
                            error: result.reason === "conflict" ? "The file changed while the write was being prepared. Re-read it and try again." : "The target file no longer exists."
                        };
                    }
                    return {
                        success: true,
                        action: "updated",
                        path: existing.path
                    };
                }
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["prepareAgentTurn"])(turnId);
                const latest = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                // Re-check after the async snapshot. Another tool may have created the
                // file while this call was waiting.
                const raced = latest.files.find({
                    "LatexTools.useAssistantTool.raced": (file)=>file.path === normalized
                }["LatexTools.useAssistantTool.raced"]);
                if (raced) {
                    if (raced.type !== "tex") {
                        return {
                            success: false,
                            error: `Cannot overwrite binary file: ${normalized}`
                        };
                    }
                    const normalizedAfter = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(content);
                    const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["applyAgentEdit"])({
                        turnId,
                        toolCallId,
                        fileId: raced.id,
                        before: raced.content ?? "",
                        after: content,
                        applied: [
                            {
                                start: 0,
                                end: normalizedAfter.length,
                                before: (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$file$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeEol"])(raced.content ?? ""),
                                after: normalizedAfter
                            }
                        ]
                    });
                    if (!result.ok) {
                        return {
                            success: false,
                            error: result.reason === "conflict" ? "The file changed while the write was being prepared. Re-read it and try again." : "The target file no longer exists."
                        };
                    }
                    return {
                        success: true,
                        action: "updated",
                        path: raced.path
                    };
                }
                const name = normalized.split("/").pop() ?? normalized;
                const fileId = latest.addFile({
                    name,
                    path: normalized,
                    type: "tex",
                    content
                });
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$ai$2f$agent$2d$edits$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["recordAgentFileCreate"])({
                    turnId,
                    toolCallId,
                    fileId,
                    filePath: normalized,
                    content
                });
                return {
                    success: true,
                    action: "created",
                    path: normalized
                };
            }
        }["LatexTools.useAssistantTool"]
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"])({
        toolName: "set_main_document",
        description: "Set which .tex file is compiled as the project's main document.",
        parameters: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().describe("Relative path of the .tex file to use as the main document")
        }),
        execute: {
            "LatexTools.useAssistantTool": async ({ path })=>{
                const state = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$stores$2f$document$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useDocumentStore"].getState();
                const normalized = path.replace(/^\/+/, "");
                const file = state.files.find({
                    "LatexTools.useAssistantTool.file": (candidate)=>candidate.path === normalized || candidate.name === normalized
                }["LatexTools.useAssistantTool.file"]);
                if (!file) {
                    return {
                        success: false,
                        error: `File not found: ${normalized}`
                    };
                }
                if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$web$2f$lib$2f$project$2d$files$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isLatexDocumentFile"])(file)) {
                    return {
                        success: false,
                        error: `${file.path} is not a .tex document`
                    };
                }
                state.setMainFile(file.id);
                return {
                    success: true,
                    mainDocument: file.path
                };
            }
        }["LatexTools.useAssistantTool"]
    });
    return null;
};
_s(LatexTools, "tEVSOzGQW/NBcQCWFaZc5hhDe7k=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$assistant$2d$ui$2f$react$2f$dist$2f$model$2d$context$2f$useAssistantTool$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAssistantTool"]
    ];
});
_c = LatexTools;
var _c;
__turbopack_context__.k.register(_c, "LatexTools");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/web/components/workspace/editor/research-tools.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ResearchTools",
    ()=>ResearchTools
]);