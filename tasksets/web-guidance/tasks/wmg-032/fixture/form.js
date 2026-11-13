export function validate(form) {
  if (form.elements.email.value === '') {
    alert('email required');
    event.returnValue = false;
    return false;
  }
  return true;
}
