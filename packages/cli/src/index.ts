import { command, run, string, positional } from 'cmd-ts';
import convertX3D from '@riboseinc/glossarist-x3duom';

const app = command({
  name: 'my-first-app',
  args: {
    someArg: positional({ type: string, displayName: 'some arg' }),
  },
  handler: async ({ someArg }) => {
    console.log({ someArg });
    for await (const ds of convertX3D('test')) {
      console.log(JSON.stringify(ds));
    }
  },
});

run(app, process.argv.slice(2));
