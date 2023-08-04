import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fileSave } from 'browser-fs-access';

import styles from './app.module.css';
import { convertors, parse } from './convertors.js';
import { asProposal, processLinks, asRegisterItems } from '../../common/src/index.js';


type Upload = (FileSystemFileEntry | FileSystemDirectoryEntry)[];


const encoder = new TextEncoder();


const DEFAULT_LINK_URN_PREFIX = 'urn:iso:std:iso:12345:';


const App: React.FC<Record<never, never>> = function () {
  const [convertorName, setConvertorName] =
    useState<keyof typeof convertors>(Object.keys(convertors)[0]!);

  const [emitFormat, setEmitFormat] = useState<'conceptList' | 'proposal'>('proposal');

  const [linkPrefix, setLinkPrefix] = useState<string>(DEFAULT_LINK_URN_PREFIX);
  const [gitUsername, setGitUsername] = useState<string>('');
  const [registerVersion, setRegisterVersion] = useState<string>('');

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
        if (emitFormat === 'proposal') {
          const stream = canHandleLinks
            ? processLinks(convertor.parseLinks!, asRegisterItems(conceptStream), {
                linkURNPrefix: linkPrefix,
                onProgress: function (msg) {
                  log(`Parse links: ${msg}`);
                },
              })
            : asRegisterItems(conceptStream);
          const { proposalDraft, itemPayloads } = await asProposal(stream, {
            submittingStakeholderGitServerUsername: gitUsername,
            registerVersion,
          }, {
            onProgress: function (msg) { log(`Prepare proposal: ${msg}`); },
          });
          results.set('proposalDraft', proposalDraft);
          results.set('itemPayloads', itemPayloads);
          count += 1;
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
  const canHandleLinks = (convertor?.parseLinks && emitFormat === 'proposal');

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
        </p>
        <p>
          <label htmlFor="emitProposal">Output as register change proposal:</label>
          &emsp;
          <input
            type="checkbox"
            id="emitProposal"
            checked={emitFormat === 'proposal'}
            onChange={() => {
              if (emitFormat === 'proposal') {
                setEmitFormat('conceptList')
              } else {
                setEmitFormat('proposal')
              }
            }}
          />
        </p>
        <ul className={emitFormat !== 'proposal' ? styles.hidden : undefined}>
          <li>
            &emsp;
            <label htmlFor="linkURNPrefix">URN prefix for internal links:</label>
            &ensp;
            <input
              disabled={!canHandleLinks}
              type="text"
              id="linkURNPrefix"
              value={canHandleLinks ? linkPrefix : "(unavailable)"}
              onChange={evt => setLinkPrefix(evt.currentTarget.value)}
            />
          </li>
          <li>
            &emsp;
            <label htmlFor="registerVersion">Register version:</label>
            &ensp;
            <input
              type="text"
              id="registerVersion"
              value={registerVersion}
              onChange={evt => setRegisterVersion(evt.currentTarget.value)}
            />
          </li>
          <li>
            &emsp;
            <label htmlFor="gitUsername">Submitter’s version control system server username:</label>
            &ensp;
            <input
              type="text"
              id="gitUsername"
              value={gitUsername}
              onChange={evt => setGitUsername(evt.currentTarget.value)}
            />
          </li>
        </ul>
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
                  <div
                      key={idx}
                      className={msg.toLowerCase().indexOf('error') >= 0
                        ? styles.inBold
                        : undefined}>
                    {msg}
                  </div>
                )
              : <>
                  <em>{convertor.inputDescription}</em>
                  <br />
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
