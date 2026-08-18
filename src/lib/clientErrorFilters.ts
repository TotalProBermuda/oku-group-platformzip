const METAMASK_EXTENSION_ORIGIN = "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/";

export function isKnownInjectedExtensionError(input: {
  message?: unknown;
  filename?: unknown;
  stack?: unknown;
}) {
  const message = typeof input.message === "string" ? input.message : "";
  const source = [input.filename, input.stack]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  return /failed to connect to metamask/i.test(message) && source.includes(METAMASK_EXTENSION_ORIGIN);
}

/**
 * Runs before Next's development overlay attaches its listeners. Our product
 * does not integrate with MetaMask, so an exception injected by that extension
 * must not be rendered as an application runtime failure.
 */
export const injectedExtensionErrorGuardScript = `
(function(){
  var origin=${JSON.stringify(METAMASK_EXTENSION_ORIGIN)};
  function known(message,source){
    return /failed to connect to metamask/i.test(String(message||'')) && String(source||'').indexOf(origin)!==-1;
  }
  window.addEventListener('error',function(event){
    var stack=event.error&&event.error.stack;
    if(known(event.message,String(event.filename||'')+'\\n'+String(stack||''))){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
  window.addEventListener('unhandledrejection',function(event){
    var reason=event.reason;
    var message=reason&&reason.message||reason;
    var stack=reason&&reason.stack;
    if(known(message,stack)){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);
})();`;
