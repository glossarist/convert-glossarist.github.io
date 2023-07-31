import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fileSave } from 'browser-fs-access';

import styles from './app.module.css';
import { convertors, parse } from './convertors.js';
import { asRegisterItems } from 'common';


type Upload = (FileSystemFileEntry | FileSystemDirectoryEntry)[];


const encoder = new TextEncoder();


const DEFAULT_LINK_URN_PREFIX = 'urn:iso:std:iso:12345:';


const App: React.FC<Record<never, never>> = function () {
  const [convertorName, setConvertorName] =
    useState<keyof typeof convertors>(Object.keys(convertors)[0]!);

  const [emitFormat, setEmitFormat] = useState<'conceptList' | 'registerItemList'>('registerItemList');

  const [linkPrefix, setLinkPrefix] = useState<string>(DEFAULT_LINK_URN_PREFIX);

  const [_log, setLog] = useState<string[]>([]);

  function log(msg: string) {
    setLog(log => [ ...log, msg ]);
  }

  async function handleDrop(upload: Upload) {
    if (upload) {
      setLog([`Using convertor ${convertorName}`]);
      const results: Map<string, any> = new Map();
      let count: number = 0;
      const conceptStream = parse(convertorName, upload, linkPrefix, log);
      try {
        if (emitFormat === 'registerItemList') {
          results.set('registerItems', {});
          for await (const registerItem of asRegisterItems(conceptStream)) {
            for (const [classID, item] of Object.entries(registerItem)) {
              const items = results.get('registerItems');
              results.set('registerItems', {
                ...items,
                [classID]: [ ...(items[classID] ?? []), item ],
              });
              count += 1;
            }
          }
        } else {
          for await (const concept of conceptStream) {
            results.set('concepts', [...(results.get('concepts') ?? []), concept]);
            count += 1;
          }
        }
      } catch (e) {
        log(`Failed to process upload: ${(e as any).toString?.()}`);
      } finally {
        if (count > 0) {
          log(`${count} items obtained; saving to JSON`);
          fileSave(new Blob(
            [encoder.encode(JSON.stringify(Object.fromEntries(results.entries())))],
            { type: 'application/json' },
          ), {
            fileName: `glossarist-${convertorName}-conversion-result.json`,
          });
        } else {
          log("No results obtained.");
        }
      }
    }
  }

  function handleConvertorSelect(evt: React.FormEvent<HTMLSelectElement>) {
    const convertorName = evt.currentTarget.value;
    setConvertorName(convertorName);
  }

  const convertor = convertors[convertorName];

  return (
    <div className={styles.app}>
      <h1 className={styles.header}>Convert concepts to Glossarist format</h1>
      <div
          className={styles.convertorSelector}>
        <p>
          Select the desired convertor and drop files below.
          Download will be initiated when conversion is complete.
        </p>
        <p>
          <label htmlFor="convertor">Selected convertor:</label>
          &emsp;
          <select
              id="convertor"
              onChange={handleConvertorSelect}
              value={convertorName}>
            {Object.entries(convertors).map(([_convertorName, convertor]) =>
              <option
                key={_convertorName}
                value={_convertorName}
                label={`${_convertorName} (${convertor.label})`}
              />
            )}
          </select>
          {convertor?.parseLinks
            ? <>
                &emsp;
                <label htmlFor="linkURNPrefix">URN prefix for internal links:</label>
                &ensp;
                <input
                  type="text"
                  id="linkURNPrefix"
                  value={linkPrefix}
                  onChange={evt => setLinkPrefix(evt.currentTarget.value)}
                />
              </>
            : null}
        </p>
        <p>
          <label htmlFor="emitRegisterItems">Output as register items:</label>
          &emsp;
          <input
            type="checkbox"
            id="emitRegisterItems"
            checked={emitFormat === 'registerItemList'}
            onChange={() => {
              if (emitFormat === 'registerItemList') {
                setEmitFormat('conceptList')
              } else {
                setEmitFormat('registerItemList')
              }
            }}
          />
        </p>
      </div>
      <div className={styles.drop}>
        {convertor
          ? <DropReceiver
              className={styles.spanFull}
              onDrop={handleDrop}
            />
          : undefined}
        <div className={styles.log}>
          {convertor
            ? _log.length > 0
              ? _log.map((msg, idx) =>
                  <div key={idx}>
                    {msg}
                  </div>
                )
              : <>
                  <em>{convertor.inputDescription}</em>
                  can&nbsp;be dragged&nbsp;into this&nbsp;area
                </>
            : <>No convertor is available.</>}
        </div>
      </div>
    </div>
  );
};


const DropReceiver: React.FC<{
  onDrop: (input: Upload) => void;
  prompt?: JSX.Element;
  className?: string;
}> = function ({ onDrop, prompt, className }) {
  function handleDragOver(evt: React.DragEvent) {
    evt.preventDefault();
  }
  function handleDrop(evt: React.DragEvent) {
    evt.preventDefault();
    const uploads = [...evt.dataTransfer.items].
      map(i => i.webkitGetAsEntry()).
      filter(e => e !== null && (e.isFile || e.isDirectory)) as Upload;
    onDrop(uploads);
  }
  return (
    <div
        className={className}
        onDragOver={handleDragOver}
        onDrop={handleDrop}>
      {prompt ?? <>&nbsp;</>}
    </div>
  );
};


export function renderApp(el: Element) {
  return createRoot(el).render(<App />);
}
