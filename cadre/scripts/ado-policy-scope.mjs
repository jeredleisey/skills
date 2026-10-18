// The scope rule of an Azure DevOps (ADO) branch policy, shared by branch-policy-ado.mjs and
// setup-derive.mjs. It has no side effect, so a script can import it.
// A scope entry covers the branch when its repository id is null or the id of the repo, and its ref
// name is equal (matchKind Exact, or none) or a prefix (matchKind Prefix).
export const covers = (entry, repoId, branch) => {
  if (typeof entry?.refName !== 'string') return false;
  const repoOk = entry.repositoryId === null || (typeof entry.repositoryId === 'string' && entry.repositoryId.toLowerCase() === repoId.toLowerCase());
  const refOk = entry.matchKind === 'Prefix' ? branch.startsWith(entry.refName) : entry.refName === branch;
  return repoOk && refOk;
};

// The policies that count: enabled, blocking, not deleted, and with a scope entry that covers the branch.
export const livePolicies = (policies, repoId, branch) =>
  policies.filter(
    (p) => p?.isEnabled === true && p.isBlocking === true && p.isDeleted !== true && Array.isArray(p.settings?.scope) && p.settings.scope.some((entry) => covers(entry, repoId, branch)),
  );
