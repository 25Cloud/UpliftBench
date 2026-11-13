export async function loadAll(ids) {
  const users = await fetchOne('users', ids[0]);
  const posts = await fetchOne('posts', ids[1]);
  const tags = await fetchOne('tags', ids[2]);
  return { users, posts, tags };
}
