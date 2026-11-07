import { Octokit } from '@octokit/rest';

export function getOctokitClient(token) {
  if (!token) {
    throw new Error('GitHub Personal Access Token non fornito.');
  }
  return new Octokit({ auth: token });
}

export async function verifyToken(token) {
  const octokit = getOctokitClient(token);
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

export async function getUserOrgs(octokit) {
  try {
    const { data } = await octokit.orgs.listForAuthenticatedUser();
    return data;
  } catch {
    return [];
  }
}

/**
 * Esegue una chiamata API con retry automatico in caso di Secondary Rate Limit
 */
export async function withRateLimitRetry(fn, maxRetries = 2, initialDelayMs = 5000) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 403 && (
        (err.message && err.message.includes('secondary rate limit')) ||
        (err.response && err.response.headers && err.response.headers['retry-after'])
      );

      if (isRateLimit && attempt < maxRetries) {
        attempt++;
        const retryAfterHeader = err.response?.headers?.['retry-after'];
        const waitTimeMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : delay;
        console.warn(`\n⚠️ GitHub Secondary Rate Limit rilevato. Attesa di ${Math.round(waitTimeMs / 1000)}s prima di ritentare (tentativo ${attempt}/${maxRetries})...`);
        await new Promise(res => setTimeout(res, waitTimeMs));
        delay *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
}

export async function createRepository(octokit, { name, description = '', isPrivate = false, org = null }) {
  return withRateLimitRetry(async () => {
    if (org) {
      const response = await octokit.repos.createInOrg({
        org,
        name,
        description,
        private: isPrivate,
        auto_init: false
      });
      return response.data;
    } else {
      const response = await octokit.repos.createForAuthenticatedUser({
        name,
        description,
        private: isPrivate,
        auto_init: false
      });
      return response.data;
    }
  });
}

export async function checkRepositoryExists(octokit, owner, repoName) {
  try {
    const { data } = await octokit.repos.get({
      owner,
      repo: repoName
    });
    return data;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createGitHubRelease(octokit, { owner, repo, tag, name, body }) {
  return withRateLimitRetry(async () => {
    const response = await octokit.repos.createRelease({
      owner,
      repo,
      tag_name: tag,
      name: name || tag,
      body: body || `Release automatica ${tag}`,
      draft: false,
      prerelease: false
    });
    return response.data;
  });
}

/**
 * Recupera l'elenco dei repository dell'utente con statistiche utili per sync e sync-all
 */
export async function listUserRepositories(octokit, { limit = 30 } = {}) {
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    direction: 'desc',
    per_page: limit
  });
  return data;
}

/**
 * Recupera i dettagli completi e lo stato di un repo (star, fork, open issues, default branch)
 */
export async function getRepoOverview(octokit, owner, repo) {
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    name: data.name,
    fullName: data.full_name,
    private: data.private,
    htmlUrl: data.html_url,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    updatedAt: data.updated_at
  };
}
