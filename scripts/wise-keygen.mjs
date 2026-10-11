// Generates an RSA key pair for Wise SCA. Writes OUTSIDE the repo (default: ~/wise-keys). Never commit the private key.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
const dir=process.argv[2]||path.join(os.homedir(),'wise-keys');fs.mkdirSync(dir,{recursive:true});
const priv=path.join(dir,'wise-private.pem'),pub=path.join(dir,'wise-public.pem');
if(fs.existsSync(priv)){console.log('Existiert schon, nichts ueberschrieben:',priv);process.exit(0)}
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
fs.writeFileSync(priv,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
fs.writeFileSync(pub,publicKey.export({type:'spki',format:'pem'}));
console.log('Private (GEHEIM, nie teilen):',priv);console.log('Public (bei Wise hochladen):',pub);
