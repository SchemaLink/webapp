import {
  angleTolerance,
  snapTolerance,
  snapToNeighbourDistancesAndAngles,
} from './geometricSnapping';
import { getPresentGraph, getVisualGraph, NodePosition } from '../selectors';
import {
  average,
  CircleGuide,
  defaultNodeRadius,
  defaultRelationshipLength,
  Guides,
  HandleGuide,
  LineGuide,
  idsMatch,
  Point,
  nextAvailableId,
  nextId,
  nodeSelected,
  selectedNodeIdMap,
  selectedNodeIds,
  selectedNodes,
  selectedRelationshipIdMap,
  selectedRelationshipIds,
  translate,
  Vector,
  Id,
  Graph,
  Relationship,
  Node,
  EntitySelection,
  RelationshipType,
  Cardinality,
  Ontology,
  ViewTransformation,
  Coordinate,
  Component,
  Attribute,
  SchemaProperties,
  hardcodedOntologies,
  CustomCardinality,
} from '@neo4j-arrows/model';
import { BoundingBox, calculateBoundingBox } from '@neo4j-arrows/graphics';
import { lockHandleDragType } from './mouse';
import { Dispatch } from 'redux';
import { ArrowsState } from '../reducers';
import { GraphAction, MergeSpecs } from '../reducers/graph';
import { ActionMemosState } from '../reducers/actionMemos';
import { MouseState } from '../reducers/mouse';
import {
  loadOntologyExamplesFailure,
  loadOntologyExamplesRequest,
  loadOntologyExamplesSuccess,
} from './ontologies';
import {
  MAX_PAGE_SIZE,
  properties,
  nTerms,
} from '@neo4j-arrows/ontology-search';

export const createNode =
  () => (dispatch: Dispatch, getState: () => ArrowsState) => {
    let newNodePosition = new Point(0, 0);
    const graph = getPresentGraph(getState());
    const dimensions: Array<keyof Coordinate> = ['x', 'y'];
    if (graph.nodes.length > 0) {
      const ranges = dimensions
        .map((dimension) => {
          const coordinates = graph.nodes.map(
            (node) => node.position[dimension]
          );
          const min = Math.min(...coordinates);
          const max = Math.max(...coordinates);
          const spread = max - min;
          return {
            min,
            max,
            spread,
          };
        })
        .sort((a, b) => b.spread - a.spread);
      newNodePosition = new Point(
        ranges[0].min,
        ranges[1].max + defaultRelationshipLength + defaultNodeRadius * 2
      );
    }

    dispatch({
      category: 'GRAPH',
      type: 'CREATE_NODE',
      newNodeId: nextAvailableId(getPresentGraph(getState()).nodes),
      newNodePosition,
      caption: '',
      description: '',
      style: {},
    });
  };

export const createNodesAndRelationships =
  (sourceNodeIds: Id[], targetNodeDisplacement: Vector) =>
  (dispatch: Dispatch, getState: () => ArrowsState) => {
    const graph = getPresentGraph(getState());

    const newRelationshipIds: Id[] = [];
    const targetNodeIds: Id[] = [];
    let newRelationshipId = nextAvailableId(graph.relationships);
    let targetNodeId = nextAvailableId(graph.nodes);

    const targetNodePositions: Point[] = [];

    sourceNodeIds.forEach((sourceNodeId) => {
      newRelationshipIds.push(newRelationshipId);
      targetNodeIds.push(targetNodeId);

      newRelationshipId = nextId(newRelationshipId);
      targetNodeId = nextId(targetNodeId);

      const sourceNodePosition = graph.nodes.find(
        (node) => node.id === sourceNodeId
      )?.position;
      if (sourceNodePosition) {
        targetNodePositions.push(
          sourceNodePosition.translate(targetNodeDisplacement)
        );
      }
    });

    dispatch({
      category: 'GRAPH',
      type: 'CREATE_NODES_AND_RELATIONSHIPS',
      sourceNodeIds,
      newRelationshipIds,
      targetNodeIds,
      targetNodePositions,
      caption: '',
      description: '',
      style: {},
    });
  };

export const connectNodes =
  (sourceNodeIds: Id[], targetNodeIds: Id[]) =>
  (dispatch: Dispatch, getState: () => ArrowsState) => {
    const graph = getPresentGraph(getState());
    const newRelationshipIds: Id[] = [];
    let newRelationshipId = nextAvailableId(graph.relationships);
    sourceNodeIds.forEach(() => {
      newRelationshipIds.push(newRelationshipId);
      newRelationshipId = nextId(newRelationshipId);
    });

    dispatch({
      category: 'GRAPH',
      type: 'CONNECT_NODES',
      sourceNodeIds,
      newRelationshipIds,
      targetNodeIds,
    });
  };

export const tryMoveHandle = ({
  dragType,
  corner,
  initialNodePositions,
  initialMousePosition,
  newMousePosition,
}: {
  dragType: string;
  corner: { x: string; y: string };
  initialNodePositions: NodePosition[];
  initialMousePosition: Point;
  newMousePosition: Point;
}) => {
  function applyScale(
    vector: Vector,
    viewTransformation: ViewTransformation,
    dispatch: Dispatch,
    mouse: MouseState
  ) {
    const maxDiameter =
      Math.max(...initialNodePositions.map((entry) => entry.radius)) * 2;

    const dimensions: Array<{
      coordinate: keyof Coordinate;
      component: keyof Component;
    }> = [
      { coordinate: 'x', component: 'dx' },
      { coordinate: 'y', component: 'dy' },
    ];

    const ranges: {
      [key: string]: {
        min: number;
        max: number;
        oldSpread: number;
        newSpread: number;
      };
    } = {};

    const choose = (mode: string, min: number, max: number, other: number) => {
      switch (mode) {
        case 'min':
          return min;
        case 'max':
          return max;
        default:
          return other;
      }
    };

    dimensions.forEach(({ coordinate, component }) => {
      const coordinates = initialNodePositions.map(
        (entry) => entry.position[coordinate]
      );
      const min = Math.min(...coordinates);
      const max = Math.max(...coordinates);
      const oldSpread = max - min;
      let newSpread = choose(
        corner[coordinate],
        oldSpread - vector[component],
        oldSpread + vector[component],
        oldSpread
      );
      if (newSpread < 0) {
        if (newSpread < -maxDiameter) {
          newSpread += maxDiameter;
        } else {
          newSpread = 0;
        }
      }
      ranges[coordinate] = {
        min,
        max,
        oldSpread,
        newSpread,
      };
    });
    const snapRatios = [-1, 1];
    if (corner.x !== 'mid' && corner.y !== 'mid') {
      let ratio = Math.max(
        ...dimensions.map(({ coordinate }) => {
          const range = ranges[coordinate];
          return range.newSpread / range.oldSpread;
        })
      );
      const smallestSpread = Math.min(
        ...dimensions.map(({ coordinate }) => ranges[coordinate].oldSpread)
      );
      snapRatios.forEach((snapRatio) => {
        if (Math.abs(ratio - snapRatio) * smallestSpread < snapTolerance) {
          ratio = snapRatio;
        }
      });
      dimensions.forEach(({ coordinate }) => {
        const range = ranges[coordinate];
        range.newSpread = range.oldSpread * ratio;
      });
    } else {
      dimensions.forEach(({ coordinate }) => {
        const range = ranges[coordinate];
        let ratio = range.newSpread / range.oldSpread;
        snapRatios.forEach((snapRatio) => {
          if (Math.abs(ratio - snapRatio) * range.oldSpread < snapTolerance) {
            ratio = snapRatio;
          }
        });
        range.newSpread = range.oldSpread * ratio;
      });
    }

    const coordinate = (position: Point, dimension: keyof Coordinate) => {
      const original = position[dimension];
      const range = ranges[dimension];
      switch (corner[dimension]) {
        case 'min':
          return (
            range.max -
            ((range.max - original) * range.newSpread) / range.oldSpread
          );
        case 'max':
          return (
            range.min +
            ((original - range.min) * range.newSpread) / range.oldSpread
          );
        default:
          return original;
      }
    };

    const nodePositions: NodePosition[] = initialNodePositions.map((entry) => {
      return {
        nodeId: entry.nodeId,
        position: new Point(
          coordinate(entry.position, 'x'),
          coordinate(entry.position, 'y')
        ),
        radius: entry.radius,
      };
    });

    const guidelines = [];
    guidelines.push(
      new HandleGuide(viewTransformation.inverse(newMousePosition))
    );
    dimensions.forEach(({ coordinate }) => {
      if (corner[coordinate] !== 'mid') {
        const range = ranges[coordinate];
        const guideline = {
          type: coordinate === 'x' ? 'VERTICAL' : 'HORIZONTAL',
          [coordinate]: corner[coordinate] === 'min' ? range.max : range.min,
        };
        guidelines.push(guideline);
      }
    });

    dispatch(
      moveNodes(
        initialMousePosition,
        newMousePosition || mouse.mousePosition,
        nodePositions,
        new Guides(guidelines)
      )
    );
  }

  function applyRotation(
    viewTransformation: ViewTransformation,
    dispatch: Dispatch,
    mouse: MouseState
  ) {
    const center = average(initialNodePositions.map((entry) => entry.position));
    const initialOffset = viewTransformation
      .inverse(initialMousePosition)
      .vectorFrom(center);
    const radius = initialOffset.distance();
    const guidelines = [];
    guidelines.push(new CircleGuide(center, radius, newMousePosition));

    const initialAngle = initialOffset.angle();
    let newAngle = viewTransformation
      .inverse(newMousePosition)
      .vectorFrom(center)
      .angle();
    let rotationAngle = newAngle - initialAngle;
    const snappedAngle =
      Math.round(rotationAngle / angleTolerance) * angleTolerance;
    const snapError = Math.abs(rotationAngle - snappedAngle);
    if (snapError < Math.PI / 20) {
      rotationAngle = snappedAngle;
      newAngle = initialAngle + rotationAngle;
      guidelines.push(new LineGuide(center, initialAngle, newMousePosition));
      guidelines.push(new LineGuide(center, newAngle, newMousePosition));
    }
    guidelines.push(
      new HandleGuide(center.translate(initialOffset.rotate(rotationAngle)))
    );

    const nodePositions: NodePosition[] = initialNodePositions.map((entry) => {
      return {
        nodeId: entry.nodeId,
        position: center.translate(
          entry.position.vectorFrom(center).rotate(rotationAngle)
        ),
        radius: entry.radius,
      };
    });

    const guides = new Guides(guidelines);

    dispatch(
      moveNodes(
        initialMousePosition,
        newMousePosition || mouse.mousePosition,
        nodePositions,
        guides
      )
    );
  }

  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const { viewTransformation, mouse } = getState();

    const mouseVector = newMousePosition
      .vectorFrom(initialMousePosition)
      .scale(1 / viewTransformation.scale);

    let mode = dragType;
    if (mode === 'HANDLE') {
      const center = average(
        initialNodePositions.map((entry) => entry.position)
      );
      const centerVector = viewTransformation
        .inverse(initialMousePosition)
        .vectorFrom(center);

      if (Math.abs(centerVector.unit().dot(mouseVector.unit())) < 0.5) {
        mode = 'HANDLE_ROTATE';
      } else {
        mode = 'HANDLE_SCALE';
      }

      if (mouseVector.distance() > 20) {
        dispatch(lockHandleDragType(mode));
      }
    }

    switch (mode) {
      case 'HANDLE_ROTATE':
        applyRotation(viewTransformation, dispatch, mouse);
        break;

      case 'HANDLE_SCALE':
        applyScale(mouseVector, viewTransformation, dispatch, mouse);
        break;
    }
  };
};

export const tryMoveNode = ({
  nodeId,
  oldMousePosition,
  newMousePosition,
  forcedNodePosition,
}: {
  nodeId: Id;
  oldMousePosition: Point;
  newMousePosition: Point;
  forcedNodePosition: Point;
}) => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const { viewTransformation, mouse } = state;
    const visualGraph = getVisualGraph(state);
    const graph = visualGraph.graph;
    const visualNode = visualGraph.nodes[nodeId];
    let naturalPosition;
    const otherSelectedNodes = selectedNodeIds(state.selection).filter(
      (selectedNodeId) => selectedNodeId !== nodeId
    );
    const activelyMovedNode = graph.nodes.find((node) =>
      idsMatch(node.id, nodeId)
    ) as unknown as Node;

    if (forcedNodePosition) {
      naturalPosition = forcedNodePosition;
    } else {
      const vector = newMousePosition
        .vectorFrom(oldMousePosition)
        .scale(1 / viewTransformation.scale);
      const currentPosition =
        getState().guides.naturalPosition || activelyMovedNode?.position;

      naturalPosition = currentPosition?.translate(vector);
    }

    const snaps = snapToNeighbourDistancesAndAngles(
      graph,
      nodeId,
      naturalPosition,
      otherSelectedNodes
    );
    let guides = new Guides();
    let newPosition = naturalPosition;
    if (snaps.snapped) {
      guides = new Guides(snaps.guidelines, naturalPosition, visualNode.radius);
      newPosition = snaps.snappedPosition;
    }
    const delta = newPosition.vectorFrom(activelyMovedNode?.position);
    const nodePositions = [
      {
        nodeId,
        position: newPosition,
        radius: visualNode.radius,
      },
    ];
    otherSelectedNodes.forEach((otherNodeId) => {
      const otherNode = graph.nodes.find((node) =>
        idsMatch(node.id, otherNodeId)
      );
      if (otherNode) {
        nodePositions.push({
          nodeId: otherNodeId,
          position: otherNode.position.translate(delta),
          radius: visualNode.radius,
        });
      }
    });

    dispatch(
      moveNodes(
        oldMousePosition,
        newMousePosition || mouse.mousePosition,
        nodePositions,
        guides
      )
    );
  };
};

export const moveNodes = (
  oldMousePosition: Point,
  newMousePosition: Point,
  nodePositions: NodePosition[],
  guides: Guides,
  autoGenerated = false
): GraphAction => {
  return {
    category: 'GRAPH',
    type: 'MOVE_NODES',
    oldMousePosition,
    newMousePosition,
    nodePositions,
    guides,
    autoGenerated,
  };
};

export const moveNodesEndDrag = (
  nodePositions: NodePosition[]
): GraphAction => {
  return {
    category: 'GRAPH',
    type: 'MOVE_NODES_END_DRAG',
    nodePositions,
  };
};

export const setNodeCaption = (
  selection: EntitySelection,
  caption: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_NODE_CAPTION',
  selection,
  caption,
});

export const setOntology = (
  selection: EntitySelection,
  ontologies: Ontology[]
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_ONTOLOGY',
  selection,
  ontologies,
});

export const setCardinality = (
  selection: EntitySelection,
  cardinality: Cardinality,
  customCardinality?: CustomCardinality
) => ({
  category: 'GRAPH',
  type: 'SET_CARDINALITY',
  selection,
  cardinality,
  customCardinality,
});

export const setSchemaProperties = (
  properties: SchemaProperties
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_SCHEMA_PROPERTIES',
  properties,
});

export const mergeOnPropertyValues = (
  selection: EntitySelection,
  propertyKey: string
) => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const graph = getPresentGraph(state);
    const mergeSpecs: MergeSpecs[] = selectedNodes(graph, selection).reduce(
      (result: MergeSpecs[], node) => {
        const propertyValue = node.properties[propertyKey];
        let spec = result.find(
          (spec) => spec.propertyValue === propertyValue.description
        );
        if (spec) {
          spec.purgedNodeIds.push(node.id);
          spec.positions.push(node.position);
        } else {
          spec = {
            propertyValue: propertyValue.description,
            survivingNodeId: node.id,
            purgedNodeIds: [],
            positions: [node.position],
          };
          result.push(spec);
        }
        return result;
      },
      []
    );
    for (const spec of mergeSpecs) {
      spec.position = average(spec.positions);
    }
    dispatch({
      category: 'GRAPH',
      type: 'MERGE_NODES',
      mergeSpecs,
    });
  };
};

export const mergeNodes = (selection: EntitySelection) => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const graph = getPresentGraph(state);
    const nodes = selectedNodes(graph, selection);
    if (nodes.length < 1) {
      return;
    }
    const spec = {
      survivingNodeId: nodes[0].id,
      purgedNodeIds: nodes.slice(1).map((node) => node.id),
      position: average(nodes.map((node) => node.position)),
    };
    dispatch({
      category: 'GRAPH',
      type: 'MERGE_NODES',
      mergeSpecs: [spec],
    });
  };
};

export const renameProperty = (
  selection: EntitySelection,
  oldPropertyKey: string,
  newPropertyKey: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'RENAME_PROPERTY',
  selection,
  oldPropertyKey,
  newPropertyKey,
});

export const setProperty = (
  selection: EntitySelection,
  key: string,
  value: Attribute
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_PROPERTY',
  selection,
  key,
  value,
});

export const setPropertyValues = (
  key: string,
  nodePropertyValues: Record<Id, string>
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_PROPERTY_VALUES',
  key,
  nodePropertyValues,
});

export const setArrowsProperty = (
  selection: EntitySelection,
  key: string,
  value: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_ARROWS_PROPERTY',
  selection,
  key,
  value,
});

export const removeProperty = (
  selection: EntitySelection,
  key: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'REMOVE_PROPERTY',
  selection,
  key,
});

export const removeArrowsProperty = (
  selection: EntitySelection,
  key: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'REMOVE_ARROWS_PROPERTY',
  selection,
  key,
});

export const setGraphStyle = (key: string, value: string): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_GRAPH_STYLE',
  key,
  value,
});

export const setGraphStyles = (style: any): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_GRAPH_STYLES',
  style,
});

export const setType = (
  selection: EntitySelection,
  typeValue: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_TYPE',
  selection,
  typeValue,
});

export const setRelationshipType = (
  selection: EntitySelection,
  relationshipType: RelationshipType
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_RELATIONSHIP_TYPE',
  selection,
  relationshipType,
});

export const setDescription = (
  selection: EntitySelection,
  description: string
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_DESCRIPTION',
  selection,
  description,
});

export const setExamples = (
  selection: EntitySelection,
  examples: string[]
): GraphAction => ({
  category: 'GRAPH',
  type: 'SET_EXAMPLES',
  selection,
  examples,
});

export const duplicateNodesAndRelationships = (
  nodeIdMap: Record<Id, { oldNodeId: Id; position: Point }>,
  relationshipIdMap: Record<Id, { oldRelationshipId: Id; fromId: Id; toId: Id }>
): GraphAction => ({
  category: 'GRAPH',
  type: 'DUPLICATE_NODES_AND_RELATIONSHIPS',
  nodeIdMap,
  relationshipIdMap,
});

export const deleteNodesAndRelationships = (
  nodeIdMap: Record<Id, boolean>,
  relationshipIdMap: Record<Id, boolean>
): GraphAction => ({
  category: 'GRAPH',
  type: 'DELETE_NODES_AND_RELATIONSHIPS',
  nodeIdMap,
  relationshipIdMap,
});

export const deleteSelection = () => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const selection = getState().selection;
    const relationships = getPresentGraph(getState()).relationships;

    const nodeIdMap = selectedNodeIdMap(selection);
    const relationshipIdMap = selectedRelationshipIdMap(selection);

    relationships.forEach((relationship) => {
      if (
        !relationshipIdMap[relationship.id] &&
        (nodeIdMap[relationship.fromId] || nodeIdMap[relationship.toId])
      ) {
        relationshipIdMap[relationship.id] = true;
      }
    });

    dispatch(deleteNodesAndRelationships(nodeIdMap, relationshipIdMap));
  };
};

const duplicateNodeOffset = (
  graph: Graph,
  selectedNodes: Node[],
  actionMemos: ActionMemosState
) => {
  const box = calculateBoundingBox(selectedNodes, graph, 1);
  const offset = new Vector(box.right - box.left, box.bottom - box.top);
  if (actionMemos.lastDuplicateAction) {
    const action = actionMemos.lastDuplicateAction;
    const newNodeId = Object.keys(action.nodeIdMap)[0];
    if (newNodeId) {
      const oldNodeId = action.nodeIdMap[newNodeId].oldNodeId;
      const oldNode = graph.nodes.find((n) => idsMatch(n.id, oldNodeId));
      const newNode = graph.nodes.find((n) => idsMatch(n.id, newNodeId));
      if (oldNode && newNode) {
        const translation = newNode.position.vectorFrom(oldNode.position);
        if (translation.dx > offset.dx || translation.dy > offset.dy) {
          return translation;
        }
      }
    }
  }
  return offset;
};

const inverseNodeMap = (actionMemos: ActionMemosState) => {
  if (actionMemos.lastDuplicateAction) {
    const action = actionMemos.lastDuplicateAction;
    const map: Record<Id, Id> = {};
    for (const [newNodeId, nodeSpec] of Object.entries(action.nodeIdMap)) {
      map[nodeSpec.oldNodeId] = newNodeId;
    }
    return map;
  }
  return {};
};

export const duplicateSelection = () => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const selection = state.selection;
    const graph = getPresentGraph(state);
    const actionMemos = state.actionMemos;

    const nodesToDuplicate = selectedNodes(graph, selection);
    const nodeIdMap: Record<Id, { oldNodeId: Id; position: Point }> = {};
    const oldNodeToNewNodeMap: Record<Id, Id> = {};
    const relationshipsToBeDuplicated: Record<Id, boolean> = {};

    if (nodesToDuplicate.length > 0) {
      const offset = duplicateNodeOffset(graph, nodesToDuplicate, actionMemos);

      let newNodeId = nextAvailableId(graph.nodes);
      nodesToDuplicate.forEach((oldNode) => {
        nodeIdMap[newNodeId] = {
          oldNodeId: oldNode.id,
          position: oldNode.position.translate(offset),
        };
        oldNodeToNewNodeMap[oldNode.id] = newNodeId;
        newNodeId = nextId(newNodeId);
      });

      graph.relationships.forEach((relationship) => {
        if (
          nodeSelected(selection, relationship.fromId) ||
          nodeSelected(selection, relationship.toId)
        ) {
          relationshipsToBeDuplicated[relationship.id] = true;
        }
      });
    }

    selectedRelationshipIds(selection).forEach((relationshipId) => {
      relationshipsToBeDuplicated[relationshipId] = true;
    });

    const previousNodeMap = inverseNodeMap(actionMemos);

    const relationshipIdMap: Record<
      Id,
      {
        oldRelationshipId: Id;
        type: string;
        relationshipType: RelationshipType;
        fromId: Id;
        toId: Id;
      }
    > = {};
    let newRelationshipId = nextAvailableId(graph.relationships);
    Object.keys(relationshipsToBeDuplicated).forEach((relationshipId) => {
      const oldRelationship = graph.relationships.find((r) =>
        idsMatch(relationshipId, r.id)
      );
      if (oldRelationship) {
        relationshipIdMap[newRelationshipId] = {
          oldRelationshipId: relationshipId,
          type: oldRelationship.type,
          relationshipType: oldRelationship.relationshipType,
          fromId:
            oldNodeToNewNodeMap[oldRelationship.fromId] ||
            previousNodeMap[oldRelationship.fromId] ||
            oldRelationship.fromId,
          toId:
            oldNodeToNewNodeMap[oldRelationship.toId] ||
            previousNodeMap[oldRelationship.toId] ||
            oldRelationship.toId,
        };
        newRelationshipId = nextId(newRelationshipId);
      }
    });

    dispatch(duplicateNodesAndRelationships(nodeIdMap, relationshipIdMap));
  };
};

export const reverseRelationships = (
  selection: EntitySelection
): GraphAction => ({
  category: 'GRAPH',
  type: 'REVERSE_RELATIONSHIPS',
  selection,
});

export const importNodesAndRelationships = (importedGraph: Graph) => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const graph = getPresentGraph(state);
    const visualGraph = getVisualGraph(state);
    const boundingBox =
      visualGraph.boundingBox() || new BoundingBox(0, 0, 0, 0);
    const vector = new Vector(
      boundingBox.right + graph.style.radius * 1.5,
      boundingBox.top + graph.style.radius
    );

    const newNodes: Node[] = [];
    const newRelationships: Relationship[] = [];
    const nodeIdMap: Record<Id, Id> = {};

    let newNodeId = nextAvailableId(graph.nodes);
    importedGraph.nodes.forEach((oldNode) => {
      nodeIdMap[oldNode.id] = newNodeId;
      const newNode = {
        ...oldNode,
        id: newNodeId,
      };
      newNodes.push(translate(newNode, vector));
      newNodeId = nextId(newNodeId);
    });

    let newRelationshipId = nextAvailableId(graph.relationships);
    importedGraph.relationships.forEach((oldRelationship) => {
      const newRelationship = {
        ...oldRelationship,
        id: newRelationshipId,
        fromId: nodeIdMap[oldRelationship.fromId],
        toId: nodeIdMap[oldRelationship.toId],
      };
      newRelationships.push(newRelationship);
      newRelationshipId = nextId(newRelationshipId);
    });

    dispatch({
      category: 'GRAPH',
      type: 'IMPORT_NODES_AND_RELATIONSHIPS',
      nodes: newNodes,
      relationships: newRelationships,
    });
  };
};

export const convertCaptionsToPropertyValues = () => {
  return function (dispatch: Dispatch, getState: () => ArrowsState) {
    const state = getState();
    const selection = state.selection;
    const graph = getPresentGraph(state);
    const nodesToConvert = selectedNodes(graph, selection);
    const nodePropertyValues = Object.fromEntries(
      nodesToConvert.map((node) => {
        return [node.id, node.caption];
      })
    );
    dispatch(setPropertyValues('', nodePropertyValues));
    dispatch(setNodeCaption(selection, ''));
  };
};

export const onSaveOntology = (
  selection: EntitySelection,
  ontologies: Ontology[]
) => {
  return function (dispatch: Dispatch) {
    const hardcodedOntologiesIds = hardcodedOntologies.map(
      (ontology) => ontology.id
    );
    dispatch(setOntology(selection, ontologies));
    dispatch(loadOntologyExamplesRequest());
    Promise.all(
      ontologies
        .filter((ontology) => !hardcodedOntologiesIds.includes(ontology.id))
        .map((ontology: Ontology) =>
          nTerms(ontology, 10).then((terms) => {
            return { ...ontology, terms };
          })
        )
    )
      .then((resolvedOntologies) => {
        dispatch(loadOntologyExamplesSuccess(resolvedOntologies));
      })
      .catch((error) => {
        console.error(error);
        dispatch(loadOntologyExamplesFailure());
      });
    dispatch(loadOntologyExamplesRequest());
    Promise.all(
      ontologies
        .filter((ontology) => !hardcodedOntologiesIds.includes(ontology.id))
        .map((ontology: Ontology) =>
          properties(ontology, MAX_PAGE_SIZE).then((properties) => {
            return { ...ontology, properties };
          })
        )
    )
      .then((resolvedOntologies) => {
        dispatch(loadOntologyExamplesSuccess(resolvedOntologies));
      })
      .catch((error) => {
        console.error(error);
        dispatch(loadOntologyExamplesFailure())});
  };
};
