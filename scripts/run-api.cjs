const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sdk = path.join(root, 'artifacts/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
const command = process.argv[2] ?? 'run';
const project = command === 'test' ? 'Financia.Api.Tests/Financia.Api.Tests.csproj' : 'Financia.Api/Financia.Api.csproj';
const args = command === 'run' ? ['run', '--project', project] : [command, project];
const result = spawnSync(fs.existsSync(sdk) ? sdk : 'dotnet', [...args, ...process.argv.slice(3)], {
  cwd: path.join(root, 'backend'), stdio: 'inherit',
  env: { ...process.env, DOTNET_CLI_HOME: path.join(root, 'artifacts/dotnet-home'), NUGET_PACKAGES: path.join(root, 'artifacts/nuget') },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
