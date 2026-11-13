export function mark(form) {
  for (const field of form.elements) {
    if (field.name && !field.value) field.classList.add('invalid');
  }
}
