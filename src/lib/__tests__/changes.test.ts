import { changeTextString, describeChanges, type RemoteChange } from '../changes';

const change = (over: Partial<RemoteChange>): RemoteChange => ({
  kind: 'order', action: 'edited', localId: 1, actor: 'Mom', label: 'Order #12', at: 0, ...over,
});

test('one change names the person', () => {
  const t = describeChanges([change({})]);
  expect(t).toEqual({ lead: 'Order #12 changed by ', names: ['Mom'], tail: '', detail: null });
  expect(changeTextString(describeChanges([change({ action: 'added', label: 'Expense ₹500 · Rice', actor: 'Shree' })])))
    .toBe('Expense ₹500 · Rice added by Shree');
});

test('a change from a phone that does not say who made it', () => {
  expect(changeTextString(describeChanges([change({ actor: '', action: 'deleted' })]))).toBe(
    'Order #12 deleted on another phone',
  );
});

test('several changes are summed up, newest last', () => {
  const t = describeChanges([
    change({}),
    change({ actor: 'Shree', label: 'Order #13', action: 'added' }),
    change({ label: 'Order #14', action: 'added' }),
  ]);
  expect(changeTextString(t)).toBe('3 updates from Mom & Shree');
  expect(t.detail).toBe('Latest: Order #14 added by Mom');
  expect(changeTextString(describeChanges([change({ actor: '' }), change({ actor: '' })]))).toBe(
    '2 updates from other phones',
  );
});
