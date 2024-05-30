import { type NodePath, types } from "@babel/core";
import { type Function } from "@babel/types";
import {
  callExpressionRewriter,
  type State as CallExpressionState,
} from "./callExpressionRewriter.js";

type t = typeof types;

export default function ({ types: t }: { types: t }) {
  return {
    visitor: {
      Function(path: NodePath<Function>) {
        const functionIdentifier = getFunctionIdentifier(path, t);
        if (!functionIdentifier) return;

        const functionBody = path.get("body");
        // until we support ternary, we can't have expression body
        if (!functionBody.isBlockStatement()) return;

        const labelIdentifier =
          path.scope.generateUidIdentifier("tail-call-loop");

        const conditionIdentifier =
          path.scope.generateUidIdentifier("continue-recursion");

        let args: CallExpressionState["arguments"];

        try {
          args = path.node.params.map(
            (param: (typeof path.node.params)[number]) => {
              if (t.isIdentifier(param)) {
                return {
                  identifier: param,
                  defaultValue: t.identifier("undefined"),
                };
              } else if (
                t.isAssignmentPattern(param) &&
                t.isIdentifier(param.left)
              ) {
                return { identifier: param.left, defaultValue: param.right };
              }
              throw new Error("Unsupported param expression");
            },
          );
        } catch (e: unknown) {
          return;
        }

        const state: CallExpressionState = {
          recursion: false,
          labelIdentifier,
          functionIdentifier,
          conditionIdentifier,
          functionPath: path,
          arguments: args,
        };

        path.traverse(callExpressionRewriter, state);

        // abort if there is no recursion
        if (!state.recursion) return;

        const conditionDeclaration = t.variableDeclaration("let", [
          t.variableDeclarator(conditionIdentifier, t.booleanLiteral(true)),
        ]);

        // wrap function body in while loop
        const whileStatement = t.whileStatement(
          conditionIdentifier,
          functionBody.node,
        );
        // insert `condition = false` first in loop
        functionBody.unshiftContainer(
          "body",
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              conditionIdentifier,
              t.booleanLiteral(false),
            ),
          ),
        );
        const labeledStatement = t.labeledStatement(
          labelIdentifier,
          whileStatement,
        );
        const blockStatement = t.blockStatement([
          conditionDeclaration,
          labeledStatement,
        ]);

        functionBody.replaceWith(blockStatement);
      },
    },
  };
}

function getFunctionIdentifier(functionPath: NodePath<Function>, t: t) {
  if (t.isFunctionDeclaration(functionPath.node)) {
    return functionPath.node.id;
  } else if (t.isArrowFunctionExpression(functionPath.node)) {
    if (
      t.isVariableDeclarator(functionPath.parent) &&
      t.isIdentifier(functionPath.parent.id) &&
      functionPath.scope.getBinding(functionPath.parent.id.name)?.constant
    ) {
      return functionPath.parent.id;
    }
  }
}