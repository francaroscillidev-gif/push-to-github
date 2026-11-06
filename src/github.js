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

export async function createRepository(octokit, { name, description = '', isPrivate = false, org = null }) {
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
}
