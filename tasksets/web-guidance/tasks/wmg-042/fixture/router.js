const USER_RE = /^\/users\/(\d+)$/;

export function matchUser(path) {
  const m = path.match(USER_RE);
  return m ? { id: Number(m[1]) } : null;
}

export function matchPost(path) {
  const parts = path.split('/');
  if (parts.length === 4 && parts[1] === 'posts') {
    return { id: Number(parts[2]), slug: parts[3] };
  }
  return null;
}
