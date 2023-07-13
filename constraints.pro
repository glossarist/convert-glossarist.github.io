% Make sure every package has the same specific license
gen_enforced_field(WorkspaceCwd, 'license', 'MIT').

% Make sure every package (excpet top-level package) has a homepage following specific pattern
gen_enforced_field(WorkspaceCwd, 'homepage', Homepage) :-
  workspace_field(WorkspaceCwd, 'version', _),
  atom_concat('https://github.com/glossarist/migration-adapters/tree/main/', WorkspaceCwd, Homepage).

% Make sure no two packages depend on different versions of the same dependency
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, DependencyRange2, DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  workspace_has_dependency(OtherWorkspaceCwd, DependencyIdent, DependencyRange2, DependencyType2),
  DependencyRange \= DependencyRange2.

% Make sure all inter-workspace dependencies are explicitly declared as workspace-relative
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, 'workspace:~', DependencyType) :-
  workspace_ident(_, DependencyIdent),
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, _, DependencyType).

% Whitelist typescript dev dependency on packages
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, null, devDependencies) :-
  workspace_field(WorkspaceCwd, 'version', _),
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, _, devDependencies),
  DependencyIdent \= 'typescript',.
  DependencyIdent \= 'esbuild'.

% Require specific typescript dependency version
gen_enforced_dependency(WorkspaceCwd, 'typescript', '~5.1', devDependencies) :-
  workspace_has_dependency(WorkspaceCwd, 'typescript', _, devDependencies).

% Require specific esbuild version
gen_enforced_dependency(WorkspaceCwd, 'esbuild', '~0.18', devDependencies) :-
  workspace_has_dependency(WorkspaceCwd, 'esbuild', _, devDependencies).

% TODO:
% - Disallow conflicting versions of the same package in dev and peer dependencies
% - Require every peer dependency to be listed as dev dependency
