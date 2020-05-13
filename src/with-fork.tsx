import * as React from "react";
import Document, { DocumentContext, DocumentProps } from "next/document";
import { fork, serialize, allSettled } from "effector/fork";
import cookies from "next-cookies";

import { domain } from "./domain";
import { PageContext } from "./types";
import { getStartUnits, renderPageWithScope, INITIAL_STATE_KEY } from "./lib";

/* eslint-disable no-console, complexity */

type DocumentType = typeof Document;
type NextData = DocumentProps["__NEXT_DATA__"];
type InitialStateKey = typeof INITIAL_STATE_KEY;
type InitialState = ReturnType<typeof serialize>;
type ExtendedNextData = NextData & { [key in InitialStateKey]: InitialState };

interface WrappedDocumentProps extends DocumentProps {
  initialState: InitialState;
  __NEXT_DATA__: ExtendedNextData;
}

export interface WithForkConfig {
  debug?: boolean;
}

export function withFork({ debug }: WithForkConfig = {}) {
  return (Component: DocumentType): DocumentType =>
    class WrappedDocument extends React.Component<WrappedDocumentProps> {
      static renderDocument = Component.renderDocument;
      static headTagsMiddleware = Component.headTagsMiddleware;
      static bodyTagsMiddleware = Component.bodyTagsMiddleware;
      static htmlPropsMiddleware = Component.htmlPropsMiddleware;

      static async getInitialProps(ctx: DocumentContext) {
        const originalRenderPage = ctx.renderPage;
        const startUnits = getStartUnits(originalRenderPage);

        if (debug) console.time("1.Domain forked");

        const scope = fork(domain);

        if (debug) console.timeEnd("1.Domain forked");

        ctx.renderPage = renderPageWithScope(scope, originalRenderPage);

        if (debug) console.time("2.All units settled");

        if (startUnits.length > 0) {
          await Promise.all(
            startUnits.map((unit) =>
              allSettled<PageContext>(unit, {
                scope,
                params: {
                  req: ctx.req!,
                  res: ctx.res!,
                  query: ctx.query,
                  cookies: cookies(ctx),
                  pathname: ctx.pathname,
                },
              }),
            ),
          );
        }

        if (debug) console.timeEnd("2.All units settled");

        if (debug) console.time("3.Document.getInitialProps called");

        const initialProps = await Component.getInitialProps(ctx);

        if (debug) console.timeEnd("3.Document.getInitialProps called");

        const initialState = serialize(scope);

        if (debug) console.log("4.Received initial state:", initialState);

        return {
          ...initialProps,
          initialState,
        };
      }

      constructor(props: WrappedDocumentProps) {
        super(props);

        props.__NEXT_DATA__[INITIAL_STATE_KEY] = props.initialState;
      }

      render() {
        return <Component {...this.props} />;
      }
    };
}
