/**
 * The roadmap node tree.
 *
 * The tree is what the Roadmap page shows when the candidate picks the
 * interactive view, and it makes three promises that have to hold:
 *
 *   1. the shape is the real journey — the five stages of the shared journey,
 *      each with the topics that stage is made of;
 *   2. the state of a node is read from the candidate's real progress, never
 *      invented;
 *   3. a branch says what it is: solid for a required topic, dashed for an
 *      alternative path.
 *
 * These tests cover the pure rules, so the client, the server and the tests
 * all reach the same tree from the same inputs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoadmapTree,
  clampLevel,
  connectorStyle,
  findNode,
  flattenTree,
  resolveNodeState,
  ROADMAP_TOPIC_CATALOGUE,
  summarizeTree,
  withNodeDone,
  withNodeLevel,
  type RoadmapTreeNode,
  type RoadmapTreeProgress,
} from '../shared/roadmapTree.ts';
import { ROADMAP_JOURNEY_STAGES } from '../shared/roadmapJourney.ts';

/** A candidate who has not started anything yet. */
const NO_PROGRESS: RoadmapTreeProgress = {
  skillLevels: {},
  stageProgress: {},
  currentStageId: null,
};

describe('the roadmap node tree', () => {
  it('is built from the real journey, one spine node per stage', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });

    assert.equal(tree.stages.length, ROADMAP_JOURNEY_STAGES.length);
    assert.deepEqual(
      tree.stages.map((stage) => stage.id),
      ROADMAP_JOURNEY_STAGES.map((stage) => stage.id)
    );
    // The spine carries the stage's own words, not a parallel copy of them.
    assert.equal(tree.stages[0].title, ROADMAP_JOURNEY_STAGES[0].label);
    assert.equal(tree.stages[0].objective, ROADMAP_JOURNEY_STAGES[0].objective);
    for (const stage of tree.stages) {
      assert.ok(stage.currentLevel >= 0 && stage.currentLevel <= 5);
      assert.equal(stage.targetLevel, 5);
      assert.ok(stage.resources.length > 0);
      assert.ok(stage.practice.target.length > 0);
      assert.ok(stage.practice.view.length > 0);
    }
  });

  it('gives every stage real topics, with both required and optional ones', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });

    for (const stage of tree.stages) {
      assert.ok(stage.children.length > 0, `${stage.id} has no topics`);
      assert.ok(
        stage.children.some((node) => node.required),
        `${stage.id} has no required topic`
      );
      for (const node of stage.children) {
        assert.ok(node.id.length > 0);
        assert.ok(node.title.length > 0);
        assert.ok(node.description.length > 40, `${node.id} has no real explanation`);
        assert.ok(node.targetLevel >= 1 && node.targetLevel <= 5);
        assert.ok(node.resources.length > 0, `${node.id} has no learning resource`);
        for (const resource of node.resources) {
          assert.ok(resource.url.startsWith('https://'), `${node.id} has a broken link`);
          assert.ok(resource.kind === 'free' || resource.kind === 'paid');
        }
        // Every topic has somewhere to practise it.
        assert.ok(node.practice.target.length > 0, `${node.id} has no practice target`);
        assert.ok(node.practice.view.length > 0, `${node.id} has no practice route`);
      }
    }
  });

  it('never repeats a node id, and puts the topics on both sides of the spine', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const ids = flattenTree(tree).map((node) => node.id);

    assert.equal(new Set(ids).size, ids.length);
    for (const stage of tree.stages) {
      assert.ok(stage.children.some((node) => node.side === 'start'));
      assert.ok(stage.children.some((node) => node.side === 'end'));
    }
  });

  it('draws a required topic solid and an alternative path dashed', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const nodes = flattenTree(tree);

    const required = nodes.find((node) => node.required);
    const optional = nodes.find((node) => !node.required);
    assert.ok(required);
    assert.ok(optional);
    assert.equal(connectorStyle(required), 'solid');
    assert.equal(connectorStyle(optional), 'dashed');
  });

  it('reads the state of a node from the candidate\'s real progress', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const sql = flattenTree(tree).find((node) => node.skillName === 'SQL');
    assert.ok(sql);

    // Nothing has been rated yet: a required topic is recommended.
    assert.equal(sql.state, 'recommended');

    // A skill that met its target is done.
    const finished = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, {
      progress: {
        skillLevels: { SQL: { currentLevel: 5, targetLevel: 4 } },
        stageProgress: {},
        currentStageId: null,
      },
    });
    const finishedSql = flattenTree(finished).find((node) => node.id === sql.id);
    assert.equal(finishedSql?.state, 'done');
    assert.equal(finishedSql?.currentLevel, 5);
  });

  it('puts the node of the current stage in progress', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, {
      progress: { ...NO_PROGRESS, currentStageId: 'core_skills' },
    });

    const inCurrentStage = flattenTree(tree).filter((node) => node.stageId === 'core_skills');
    assert.ok(inCurrentStage.length > 0);
    assert.ok(inCurrentStage.some((node) => node.state === 'inProgress'));

    // A later stage is not in progress yet.
    const later = flattenTree(tree).filter((node) => node.stageId === 'job_ready');
    assert.ok(later.every((node) => node.state !== 'inProgress'));
  });

  it('keeps an optional path optional even in the current stage', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, {
      progress: { ...NO_PROGRESS, currentStageId: 'core_skills' },
    });
    const optional = flattenTree(tree).find(
      (node) => node.stageId === 'core_skills' && !node.required
    );
    assert.ok(optional);
    assert.equal(optional.state, 'optional');
  });

  it('marks a stage as done when the plan says it is finished', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, {
      progress: {
        ...NO_PROGRESS,
        stageProgress: { foundation: { pct: 100, complete: true } },
      },
    });
    assert.equal(tree.stages[0].state, 'done');
  });

  it('gives spine stages learning details and supports persistent levels', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const foundation = tree.stages[0];

    assert.equal(foundation.targetLevel, 5);
    assert.ok(foundation.resources.length > 0);
    assert.ok(foundation.practice.target.length > 0);

    const levelled = withNodeLevel(tree, foundation.id, 3, {
      currentStageId: foundation.id,
    });
    assert.equal(levelled.stages[0].currentLevel, 3);
    assert.equal(levelled.stages[0].state, 'inProgress');

    const done = withNodeDone(tree, foundation.id, true, { currentStageId: null });
    assert.equal(done.stages[0].currentLevel, 5);
    assert.equal(done.stages[0].state, 'done');
  });

  it('applies the changes the candidate makes by hand', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const sql = flattenTree(tree).find((node) => node.skillName === 'SQL');
    assert.ok(sql);

    // A level the candidate set by hand is kept, and the state follows it.
    const levelled = withNodeLevel(tree, sql.id, sql.targetLevel, {
      currentStageId: null,
    });
    const levelledSql = findNode(levelled, sql.id);
    assert.equal(levelledSql?.currentLevel, sql.targetLevel);
    assert.equal(levelledSql?.state, 'done');

    // The tree that was passed in is untouched.
    assert.equal(findNode(tree, sql.id)?.currentLevel, sql.currentLevel);

    // A level below the target keeps the node open: it stays recommended until
    // the candidate reaches the stage it belongs to.
    const partial = findNode(withNodeLevel(tree, sql.id, 1, { currentStageId: null }), sql.id);
    assert.equal(partial?.state, 'recommended');

    // Inside the current stage, the same node is the one in hand.
    const inProgress = findNode(
      withNodeLevel(tree, sql.id, 1, { currentStageId: sql.stageId }),
      sql.id
    );
    assert.equal(inProgress?.state, 'inProgress');
  });

  it('marks a topic as done and keeps it done', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const sql = flattenTree(tree).find((node) => node.skillName === 'SQL');
    assert.ok(sql);

    const done = withNodeDone(tree, sql.id, true, { currentStageId: null });
    assert.equal(findNode(done, sql.id)?.state, 'done');
    assert.equal(findNode(tree, sql.id)?.state, 'recommended');
  });

  it('keeps every level inside the range the product uses for skills', () => {
    assert.equal(clampLevel(0), 0);
    assert.equal(clampLevel(3), 3);
    assert.equal(clampLevel(9), 5);
    assert.equal(clampLevel(-2), 0);
    assert.equal(clampLevel(Number.NaN), 0);
  });

  it('summarises the tree in the numbers the header shows', () => {
    const tree = buildRoadmapTree(ROADMAP_JOURNEY_STAGES, { progress: NO_PROGRESS });
    const summary = summarizeTree(tree);

    assert.equal(summary.total, flattenTree(tree).length);
    assert.equal(
      summary.done + summary.inProgress + summary.recommended + summary.optional,
      summary.total
    );
  });

  it('knows every topic of every stage', () => {
    for (const stage of ROADMAP_JOURNEY_STAGES) {
      const topics = ROADMAP_TOPIC_CATALOGUE[stage.id];
      assert.ok(topics && topics.length > 0, `${stage.id} has no topics`);
      for (const topic of topics) {
        assert.ok(topic.description.length > 40);
        assert.ok(topic.resources.every((resource) => resource.url.startsWith('https://')));
      }
    }
  });

  it('resolves the state of a node that has no progress at all', () => {
    const node: RoadmapTreeNode = {
      id: 'test-node',
      stageId: 'foundation',
      title: 'Test',
      description: 'A node used to test the state rules.',
      required: true,
      skillName: null,
      targetLevel: 4,
      practice: { target: 'Practise it once.', view: 'learning' },
      resources: [],
      side: 'start',
      currentLevel: 0,
      state: 'recommended',
    };

    assert.equal(resolveNodeState(node, { currentStageId: null }), 'recommended');
    assert.equal(resolveNodeState(node, { currentStageId: 'foundation' }), 'inProgress');
    assert.equal(
      resolveNodeState({ ...node, done: true } as RoadmapTreeNode, { currentStageId: null }),
      'done'
    );
    assert.equal(resolveNodeState({ ...node, required: false }, { currentStageId: null }), 'optional');
  });
});
