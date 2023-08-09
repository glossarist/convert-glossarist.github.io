export function tee<T>(iterable: Iterable<T>): [Generator<T>, Generator<T>] {
    const source = iterable[Symbol.iterator]();
    const buffers: [T[], T[]] = [[], []];
    const DONE = Object.create(null);

    function next(i: 0 | 1): T {
      if (buffers[i].length !== 0) {
        // Cast: we have at least one item for sure
        return buffers[i].shift()!;
      }

      const x = source.next();

      if (x.done) {
        return DONE;
      }

      // Cast: 1 - i can only be 0 or 1
      buffers[1 - i]!.push(x.value);
      return x.value;
    };

    function * gen (i: 0 | 1): Generator<T> {
      for (;;) {
        const x = next(i);

        if (x === DONE) {
          break;
        }

        yield x;
      }
    }

    return [gen(0), gen(1)];
}


export function teeAsync<T>(iterable: AsyncGenerator<T, void, undefined>):
[AsyncGenerator<T, void, undefined>, AsyncGenerator<T, void, undefined>] {
    const iterator = iterable[Symbol.asyncIterator]();
    const buffers: [
      Promise<IteratorResult<T, void>>[] | null,
      Promise<IteratorResult<T, void>>[] | null,
    ] = [[], []];

    const _AsyncIterator: AsyncIterator<T> =
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        (async function * () {}).prototype
      )
    );

    function makeIterator(buffer: Promise<IteratorResult<T, void>>[] | null, i: 0 | 1) {
      return Object.assign(Object.create(_AsyncIterator), {
        next() {
          if (!buffer) {
            return Promise.resolve({done: true, value: undefined});
          }
          if (buffer.length !== 0) {
            return buffer.shift();
          }
          const result = iterator.next();
          buffers[1 - i]?.push(result);
          return result;
        },
        async return() {
          if (buffer) {
            buffer = buffers[i] = null;
            if (!buffers[1 - i]) {
              await iterator.return();
            }
          }
          return {done: true, value: undefined};
        },
      });
    }

    return [makeIterator(buffers[0], 0), makeIterator(buffers[1], 1)];

    // Is it possible to define it in a saner way, without the prototype magic?
    //const source = iterable[Symbol.asyncIterator]();
    //const buffers: [Promise<unknown>[], Promise<unknown>[]] = [[], []];
    //async function * gen (i: 0 | 1): AsyncGenerator<unknown, void, undefined> {
    //  for (;;) {
    //    const x = next(i);

    //    if (x === DONE) {
    //      break;
    //    }

    //    yield x;
    //  }
    //  return { done: true, value: undefined };
    //}

    //function next(i: 0 | 1): Promise<unknown> {
    //  if (buffers[i].length !== 0) {
    //    return buffers[i].shift()!;
    //  }

    //  const x = source.next();

    //  if (x.done) {
    //    return Promise.resolve({ done: true, value: undefined });
    //  }

    //  // Cast: 1 - i can only be 0 or 1
    //  buffers[1 - i]!.push(x.value);
    //  return x.value;
    //};
}

