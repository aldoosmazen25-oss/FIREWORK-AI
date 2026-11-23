import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionProposal,
  computeEngagementProgress,
  computeSkillMatchRatio,
  formatBudget,
  resolveAvailabilityForMode,
  sanitizeCsvSkills,
  shouldDeliverNotification,
  validateProjectInput,
  validateProposalInput,
  validateTaskInput,
} from './domain';

test('validateProjectInput rejects empty or invalid required fields', () => {
  const invalid = validateProjectInput({
    title: 'Hi',
    description: 'Too short',
    category: '',
    budgetMin: -50,
    duration: '',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.description);
  assert.ok(invalid.errors.category);
  assert.ok(invalid.errors.budgetMin);
  assert.ok(invalid.errors.duration);
});

test('validateProjectInput accepts valid project payload and enforces budgetMax >= budgetMin', () => {
  const badRange = validateProjectInput({
    title: 'Design System Overhaul',
    description: 'Rebuild component tokens and interactive specifications for desktop web.',
    category: 'design',
    budgetMin: 4000,
    budgetMax: 2000,
    duration: '4 weeks',
  });
  assert.equal(badRange.valid, false);
  assert.ok(badRange.errors.budgetMax);

  const valid = validateProjectInput({
    title: 'Design System Overhaul',
    description: 'Rebuild component tokens and interactive specifications for desktop web.',
    category: 'design',
    budgetMin: 3000,
    budgetMax: 5000,
    duration: '4 weeks',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('validateProposalInput and validateTaskInput enforce field constraints', () => {
  const badProp = validateProposalInput({
    projectId: 0,
    approach: 'I can do it.',
    estimatedDuration: '',
    proposedBudget: 0,
  });
  assert.equal(badProp.valid, false);

  const goodProp = validateProposalInput({
    projectId: 12,
    approach: 'I will deliver architecture specs in week 1 followed by audited TypeScript modules.',
    estimatedDuration: '3 weeks',
    proposedBudget: 3500,
  });
  assert.equal(goodProp.valid, true);

  const badTask = validateTaskInput({
    title: 'A',
    status: 'unknown',
    dueDate: '20-11-2026',
  });
  assert.equal(badTask.valid, false);
  assert.ok(badTask.errors.title);
  assert.ok(badTask.errors.status);
  assert.ok(badTask.errors.dueDate);

  const goodTask = validateTaskInput({
    title: 'Audit API authentication',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-11-25',
  });
  assert.equal(goodTask.valid, true);
});

test('Work Mode and Sleep Mode availability & notification delivery rules', () => {
  assert.equal(resolveAvailabilityForMode('sleep', 'available'), 'offline');
  assert.equal(resolveAvailabilityForMode('work', 'offline'), 'available');
  assert.equal(resolveAvailabilityForMode('work', 'busy'), 'busy');

  assert.equal(
    shouldDeliverNotification({
      mode: 'sleep',
      essential: true,
      sleepModeMuteNonEssential: true,
      categoryEnabled: false,
    }),
    true,
  );
  assert.equal(
    shouldDeliverNotification({
      mode: 'sleep',
      essential: false,
      sleepModeMuteNonEssential: true,
      categoryEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldDeliverNotification({
      mode: 'work',
      essential: false,
      sleepModeMuteNonEssential: true,
      categoryEnabled: true,
    }),
    true,
  );
});

test('skill match, engagement progress, proposal transitions, and formatting', () => {
  assert.equal(computeSkillMatchRatio(['React', 'TypeScript', 'PostgreSQL'], ['react', 'postgresql']), 100);
  assert.equal(computeSkillMatchRatio(['Figma'], ['React', 'Figma']), 50);
  assert.equal(computeSkillMatchRatio([], ['React']), 0);

  assert.equal(computeEngagementProgress([{ status: 'approved' }, { status: 'pending' }]), 50);
  assert.equal(computeEngagementProgress([]), 0);

  assert.equal(canTransitionProposal('submitted', 'accepted', 'client'), true);
  assert.equal(canTransitionProposal('submitted', 'accepted', 'freelancer'), false);
  assert.equal(canTransitionProposal('submitted', 'withdrawn', 'freelancer'), true);
  assert.equal(canTransitionProposal('accepted', 'rejected', 'client'), false);

  assert.deepEqual(sanitizeCsvSkills(' React, TypeScript, react ,  '), ['React', 'TypeScript', 'react']);
  assert.equal(formatBudget('fixed', 2500, 4000), '$2,500 - $4,000');
  assert.equal(formatBudget('hourly', 95), '$95/hr');
});
