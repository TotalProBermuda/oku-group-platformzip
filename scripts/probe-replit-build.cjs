const fs = require("node:fs");
console.log(JSON.stringify({deploymentFlagIsOne:process.env.REPLIT_DEPLOYMENT==="1",deploymentFlagIsTrue:process.env.REPLIT_DEPLOYMENT==="true",deploymentFlagPresent:Boolean(process.env.REPLIT_DEPLOYMENT),developmentDomainPresent:Boolean(process.env.REPLIT_DEV_DOMAIN),cwd:fs.realpathSync("."),device:fs.statSync(".").dev,inode:fs.statSync(".").ino,fsType:fs.statfsSync(".").type,buildEnvNames:Object.keys(process.env).filter(k=>/DEPLOY|BUILD|REPLIT_DEV_DOMAIN/.test(k))}));
fs.writeFileSync(".deployment-isolation-probe-20261022-0932","build-copy-only");
console.log("DIAGNOSTIC_ONLY_NO_APPLICATION_PUBLISHED");
process.exitCode=1;
