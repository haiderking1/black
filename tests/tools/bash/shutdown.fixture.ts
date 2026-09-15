import { executeBash } from '../../../backend/tools/bash/runner'
import { installShellShutdownHandlers } from '../../../backend/tools/bash/processes'
import { tmpdir } from 'node:os'

installShellShutdownHandlers()
await executeBash('echo $$; sleep 30 & echo $!; wait', { cwd: tmpdir(), onData: data => process.stdout.write(data) })
