// The edit-profile screen: loads a profile into a draft, validates it, saves
// it and goes back to the screen that opened it.
import { createForm } from '../../forms/form.js';
import { maxLength, required, validate } from '../../validation/validators.js';

const EMPTY_PROFILE = { displayName: '', bio: '' };

const FIELDS = [
  { id: 'display-name', name: 'displayName', label: 'Display name' },
  { id: 'bio', name: 'bio', label: 'Bio', multiline: true },
];

const RULES = {
  displayName: [required('Display name'), maxLength('Display name', 40)],
  bio: [maxLength('Bio', 160)],
};

function profileKey(id) {
  return `profile.${id}`;
}

function draftValues(form) {
  const values = form.values();
  return { displayName: values.displayName.trim(), bio: values.bio.trim() };
}

function renderFields(form, errors) {
  const values = form.values();
  const lines = [];
  for (const field of FIELDS) {
    lines.push(`${field.label} [${field.id}]: ${values[field.name]}`);
    if (errors[field.name]) lines.push(`! ${errors[field.name]}`);
  }
  return lines.join('\n');
}

/** Returns the edit-profile screen, which keeps a draft of one profile until it is saved or left. */
export function createProfileEditScreen({ navigator, storage, logger, confirmDiscard }) {
  const form = createForm(EMPTY_PROFILE);
  let loaded = null;
  let errors = {};

  return {
    title: 'Edit profile',
    render(params = {}) {
      if (params.id && params.id !== loaded?.id) {
        loaded = storage.read(profileKey(params.id), null) ?? { ...EMPTY_PROFILE, id: params.id };
        form.reset({ displayName: loaded.displayName ?? '', bio: loaded.bio ?? '' });
        errors = {};
      }
      return [this.title, renderFields(form, errors)].join('\n');
    },
    set(name, value) {
      form.set(name, value);
      errors = Object.fromEntries(Object.entries(errors).filter(([field]) => field !== name));
    },
    validate() {
      errors = validate(draftValues(form), RULES);
      return errors;
    },
    save() {
      const found = this.validate();
      if (Object.keys(found).length > 0) {
        logger.warn('profile.save-rejected', { id: loaded.id, fields: Object.keys(found) });
        return { ok: false, errors: found };
      }
      const values = draftValues(form);
      const record = { ...loaded, ...values };
      storage.write(profileKey(loaded.id), record);
      logger.info('profile.saved', { id: loaded.id });
      loaded = record;
      form.reset(values);
      return { ok: true, rendered: navigator.back() };
    },
    leave() {
      if (form.isDirty() && !confirmDiscard()) return false;
      return navigator.back();
    },
  };
}
