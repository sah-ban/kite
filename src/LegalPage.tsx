// @ts-expect-error Policy content is shared with the production HTML handler.
import {renderLegalContent} from '../legal.mjs';
import type {LegalRoute} from './lib/routes';

export function LegalPage({page}:{page:LegalRoute}){
  // This renderer accepts only our static policy documents and HTML-escapes all
  // content. Sharing it keeps the JavaScript and no-JavaScript versions identical.
  return <div dangerouslySetInnerHTML={{__html:renderLegalContent(page)}}/>;
}
