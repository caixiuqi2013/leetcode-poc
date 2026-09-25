import { readFileSync } from 'node:fs';
import { ExportSchema } from '../packages/shared/src/schema';
ExportSchema.parse(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log('JSON schema valid');
