import {
  Cardinality,
  emptyGraph,
  idsMatch,
  moveTo,
  nodeSelected,
  nodeStyleAttributes,
  relationshipStyleAttributes,
  removeArrowsProperty,
  removeProperty,
  renameProperty,
  reverse,
  setCaption,
  setRelationshipType,
  setArrowsProperty,
  setProperty,
  setType,
  relationshipSelected,
  RelationshipType,
  Graph,
  Id,
  Point,
  EntitySelection,
  Ontology,
  Relationship,
  Node,
} from '@neo4j-arrows/model';
import { Action } from 'redux';
import undoable, { groupByActionTypes } from 'redux-undo';

interface CategoryGraph<T> extends Action<T> {
  category: 'GRAPH';
}

interface DescriptionAction extends CategoryGraph<'SET_GRAPH_DESCRIPTION'> {
  description: string;
}

interface CreateNodeAction extends CategoryGraph<'CREATE_NODE'> {
  newNodeId: Id;
  newNodePosition: Point;
  caption: string;
  style: any;
}

interface SelectionAction<T> extends CategoryGraph<T> {
  selection: EntitySelection;
}

interface SetOntologiesAction extends SelectionAction<'SET_ONTOLOGY'> {
  ontologies: Ontology[];
}

interface SetExamplesAction extends SelectionAction<'SET_EXAMPLES'> {
  examples: string;
}

interface SetCardinalityAction extends SelectionAction<'SET_CARDINALITY'> {
  cardinality: Cardinality;
}

interface SetNodeCaptionAction extends SelectionAction<'SET_NODE_CAPTION'> {
  caption: string;
}

interface RenamePropertyAction extends SelectionAction<'RENAME_PROPERTY'> {
  oldPropertyKey: string;
  newPropertyKey: string;
}

interface AccessPropertyAction
  extends SelectionAction<'REMOVE_PROPERTY' | 'REMOVE_ARROWS_PROPERTY'> {
  key: string;
}

interface KeyValueAction<T> extends CategoryGraph<T> {
  key: string;
  value: string;
}

interface SetPropertyAction
  extends SelectionAction<'SET_PROPERTY' | 'SET_ARROWS_PROPERTY'>,
    KeyValueAction<'SET_PROPERTY' | 'SET_ARROWS_PROPERTY'> {}

interface SetPropertyValuesAction extends CategoryGraph<'SET_PROPERTY_VALUES'> {
  key: string;
  nodePropertyValues: Record<string, string>;
}

interface ImportAction extends CategoryGraph<'IMPORT_NODES_AND_RELATIONSHIPS'> {
  nodes: Node[];
  relationships: Relationship[];
}

interface DeleteAction extends CategoryGraph<'DELETE_NODES_AND_RELATIONSHIPS'> {
  nodeIdMap: Record<string, boolean>;
  relationshipIdMap: Record<string, boolean>;
}

interface ConnectAction<T> extends CategoryGraph<T> {
  sourceNodeIds: Id[];
  targetNodeIds: Id[];
  newRelationshipIds: Id[];
}

interface CreateAction extends ConnectAction<'CREATE_NODES_AND_RELATIONSHIPS'> {
  targetNodePositions: Point[];
  caption: string;
  style: any;
}

interface SetTypeAction extends SelectionAction<'SET_TYPE'> {
  typeValue: string;
}

interface SetRelationshipTypeAction
  extends SelectionAction<'SET_RELATIONSHIP_TYPE'> {
  relationshipType: RelationshipType;
}

interface MergeNodesAction extends CategoryGraph<'MERGE_NODES'> {
  mergeSpecs: {
    survivingNodeId: Id;
    purgedNodeIds: Id[];
    position: Point;
  }[];
}

interface InlineRelationshipsAction
  extends CategoryGraph<'INLINE_RELATIONSHIPS'> {
  relationshipSpecs: {
    removeNodeId: Id;
    addPropertiesNodeId: Id;
    properties: Record<string, string>;
  }[];
}

interface GettingGraphAction extends CategoryGraph<'GETTING_GRAPH_SUCCEEDED'> {
  storedGraph: Graph;
}

interface MoveNodesAction
  extends CategoryGraph<'MOVE_NODES' | 'MOVE_NODES_END_DRAG'> {
  nodePositions: { nodeId: Id; position: Point }[];
}

interface DuplicateNodesAndRelationshipsAction
  extends CategoryGraph<'DUPLICATE_NODES_AND_RELATIONSHIPS'> {
  nodeIdMap: Record<string, { oldNodeId: Id; position: Point }>;
  relationshipIdMap: Record<
    string,
    { oldRelationshipId: Id; fromId: Id; toId: Id }
  >;
}

interface StylesAction extends CategoryGraph<'SET_GRAPH_STYLES'> {
  style: any;
}

type GraphAction =
  | CategoryGraph<'NEW_GOOGLE_DRIVE_DIAGRAM' | 'NEW_LOCAL_STORAGE_DIAGRAM'>
  | CreateNodeAction
  | DescriptionAction
  | SetOntologiesAction
  | SetExamplesAction
  | SetCardinalityAction
  | SetNodeCaptionAction
  | RenamePropertyAction
  | AccessPropertyAction
  | SetPropertyAction
  | SetPropertyValuesAction
  | ImportAction
  | DeleteAction
  | CreateAction
  | ConnectAction<'CONNECT_NODES'>
  | SelectionAction<'REVERSE_RELATIONSHIPS'>
  | SetTypeAction
  | SetRelationshipTypeAction
  | MergeNodesAction
  | KeyValueAction<'SET_GRAPH_STYLE'>
  | InlineRelationshipsAction
  | GettingGraphAction
  | MoveNodesAction
  | DuplicateNodesAndRelationshipsAction
  | StylesAction;

const graph = (state: Graph = emptyGraph(), action: GraphAction) => {
  switch (action.type) {
    case 'NEW_GOOGLE_DRIVE_DIAGRAM':
    case 'NEW_LOCAL_STORAGE_DIAGRAM':
      return emptyGraph();

    case 'SET_GRAPH_DESCRIPTION': {
      return { ...state, description: action.description };
    }

    case 'CREATE_NODE': {
      const newNodes = state.nodes.slice();
      newNodes.push({
        entityType: 'node',
        id: action.newNodeId,
        position: action.newNodePosition,
        caption: action.caption,
        style: action.style,
        properties: {},
      });
      return {
        ...state,
        nodes: newNodes,
      };
    }

    case 'CREATE_NODES_AND_RELATIONSHIPS': {
      const newNodes: Node[] = [
        ...state.nodes,
        ...action.targetNodeIds.map((targetNodeId, i: number) => {
          return {
            entityType: 'node',
            id: targetNodeId,
            position: action.targetNodePositions[i],
            caption: action.caption,
            style: action.style,
            properties: {},
          };
        }),
      ];
      const newRelationships: Relationship[] = [
        ...state.relationships,
        ...action.newRelationshipIds.map((newRelationshipId, i) => {
          return {
            id: newRelationshipId,
            entityType: 'relationship',
            type: '',
            relationshipType: RelationshipType.ASSOCIATION,
            style: {},
            properties: {},
            cardinality: Cardinality.ONE_TO_MANY,
            fromId: action.sourceNodeIds[i],
            toId: action.targetNodeIds[i],
          };
        }),
      ];

      return {
        ...state,
        nodes: newNodes,
        relationships: newRelationships,
      };
    }

    case 'CONNECT_NODES': {
      const newRelationships: Relationship[] = [
        ...state.relationships,
        ...action.newRelationshipIds.map((newRelationshipId, i) => {
          return {
            entityType: 'relationship',
            id: newRelationshipId,
            type: '',
            relationshipType: RelationshipType.ASSOCIATION,
            style: {},
            properties: {},
            cardinality: Cardinality.ONE_TO_MANY,
            fromId: action.sourceNodeIds[i],
            toId: action.targetNodeIds[i],
          };
        }),
      ];
      return {
        ...state,
        relationships: newRelationships,
      };
    }

    case 'SET_NODE_CAPTION': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? setCaption(node, action.caption)
            : node
        ),
      };
    }

    case 'SET_ONTOLOGY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? {
                ...node,
                ontologies: action.ontologies,
              }
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? {
                ...relationship,
                ontologies: action.ontologies,
              }
            : relationship
        ),
      };
    }

    case 'SET_EXAMPLES': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? {
                ...node,
                examples: action.examples,
              }
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? {
                ...relationship,
                examples: action.examples,
              }
            : relationship
        ),
      };
    }

    case 'SET_CARDINALITY': {
      return {
        ...state,
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? {
                ...relationship,
                cardinality: action.cardinality,
              }
            : relationship
        ),
      };
    }

    case 'MERGE_NODES': {
      const nodeIdMap = new Map();
      for (const spec of action.mergeSpecs) {
        for (const purgedNodeId of spec.purgedNodeIds) {
          nodeIdMap.set(purgedNodeId, spec.survivingNodeId);
        }
      }
      const translateNodeId = (nodeId: string) =>
        nodeIdMap.has(nodeId) ? nodeIdMap.get(nodeId) : nodeId;
      return {
        ...state,
        nodes: state.nodes
          .filter((node) => {
            return !action.mergeSpecs.some((spec) =>
              spec.purgedNodeIds.includes(node.id)
            );
          })
          .map((node) => {
            const spec = action.mergeSpecs.find(
              (spec) => spec.survivingNodeId === node.id
            );
            if (spec) {
              let mergedProperties = node.properties;
              for (const purgedNodeId of spec.purgedNodeIds) {
                const purgedNode = state.nodes.find(
                  (node) => node.id === purgedNodeId
                );
                mergedProperties = {
                  ...mergedProperties,
                  ...purgedNode?.properties,
                };
              }
              return {
                ...node,
                properties: mergedProperties,
                position: spec.position,
              };
            } else {
              return node;
            }
          }),
        relationships: state.relationships.map((relationship) => {
          return {
            ...relationship,
            fromId: translateNodeId(relationship.fromId),
            toId: translateNodeId(relationship.toId),
          };
        }),
      };
    }

    case 'RENAME_PROPERTY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? renameProperty(node, action.oldPropertyKey, action.newPropertyKey)
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? renameProperty(
                relationship,
                action.oldPropertyKey,
                action.newPropertyKey
              )
            : relationship
        ),
      };
    }

    case 'SET_PROPERTY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? setProperty(node, action.key, action.value)
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? setProperty(relationship, action.key, action.value)
            : relationship
        ),
      };
    }

    case 'SET_PROPERTY_VALUES': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          action.nodePropertyValues.hasOwnProperty(node.id)
            ? setProperty(node, action.key, action.nodePropertyValues[node.id])
            : node
        ),
      };
    }

    case 'SET_ARROWS_PROPERTY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeStyleAttributes.includes(action.key) &&
          nodeSelected(action.selection, node.id)
            ? setArrowsProperty(node, action.key, action.value)
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipStyleAttributes.includes(action.key) &&
          relationshipSelected(action.selection, relationship.id)
            ? setArrowsProperty(relationship, action.key, action.value)
            : relationship
        ),
      };
    }

    case 'REMOVE_PROPERTY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? removeProperty(node, action.key)
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? removeProperty(relationship, action.key)
            : relationship
        ),
      };
    }

    case 'REMOVE_ARROWS_PROPERTY': {
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          nodeSelected(action.selection, node.id)
            ? removeArrowsProperty(node, action.key)
            : node
        ),
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? removeArrowsProperty(relationship, action.key)
            : relationship
        ),
      };
    }

    case 'SET_GRAPH_STYLE': {
      const graphStyle = { ...state.style };
      graphStyle[action.key] = action.value;
      return {
        ...state,
        style: graphStyle,
      };
    }

    case 'SET_GRAPH_STYLES': {
      const graphStyle = { ...state.style };
      for (const [key, value] of Object.entries(action.style)) {
        graphStyle[key] = value;
      }
      return {
        ...state,
        style: graphStyle,
      };
    }

    case 'MOVE_NODES':
    case 'MOVE_NODES_END_DRAG': {
      const nodeIdToNode: Record<string, Node> = {};
      let clean = true;
      state.nodes.forEach((node) => {
        nodeIdToNode[node.id] = node;
      });
      action.nodePositions.forEach((nodePosition) => {
        if (nodeIdToNode[nodePosition.nodeId]) {
          const oldNode = nodeIdToNode[nodePosition.nodeId];
          clean = clean && oldNode.position.isEqual(nodePosition.position);
          nodeIdToNode[nodePosition.nodeId] = moveTo(
            oldNode,
            nodePosition.position
          );
        }
      });

      if (clean) return state;

      return {
        ...state,
        nodes: Object.values(nodeIdToNode),
      };
    }

    case 'SET_TYPE':
      return {
        ...state,
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? setType(relationship, action.typeValue)
            : relationship
        ),
      };

    case 'SET_RELATIONSHIP_TYPE':
      return {
        ...state,
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? setRelationshipType(relationship, action.relationshipType)
            : relationship
        ),
      };

    case 'DUPLICATE_NODES_AND_RELATIONSHIPS': {
      const newNodes = state.nodes.slice();
      Object.keys(action.nodeIdMap).forEach((newNodeId) => {
        const spec = action.nodeIdMap[newNodeId];
        const oldNode = state.nodes.find((n) =>
          idsMatch(n.id, spec.oldNodeId)
        ) as unknown as Node;
        const newNode: Node = {
          entityType: 'node',
          id: newNodeId,
          position: spec.position,
          caption: oldNode?.caption,
          style: { ...oldNode?.style },
          properties: { ...oldNode?.properties },
        };
        newNodes.push(newNode);
      });

      const newRelationships = state.relationships.slice();
      Object.keys(action.relationshipIdMap).forEach((newRelationshipId) => {
        const spec = action.relationshipIdMap[newRelationshipId];
        const oldRelationship = state.relationships.find((r) =>
          idsMatch(r.id, spec.oldRelationshipId)
        ) as unknown as Relationship;
        const newRelationship = {
          ...oldRelationship,
          id: newRelationshipId,
          fromId: spec.fromId,
          toId: spec.toId,
        };
        newRelationships.push(newRelationship);
      });

      return {
        ...state,
        nodes: newNodes,
        relationships: newRelationships,
      };
    }

    case 'IMPORT_NODES_AND_RELATIONSHIPS': {
      const newNodes = [...state.nodes, ...action.nodes];
      const newRelationships = [
        ...state.relationships,
        ...action.relationships,
      ];

      return {
        ...state,
        nodes: newNodes,
        relationships: newRelationships,
      };
    }

    case 'DELETE_NODES_AND_RELATIONSHIPS':
      return {
        ...state,
        nodes: state.nodes.filter((node) => !action.nodeIdMap[node.id]),
        relationships: state.relationships.filter(
          (relationship) => !action.relationshipIdMap[relationship.id]
        ),
      };

    case 'REVERSE_RELATIONSHIPS':
      return {
        ...state,
        relationships: state.relationships.map((relationship) =>
          relationshipSelected(action.selection, relationship.id)
            ? reverse(relationship)
            : relationship
        ),
      };

    case 'INLINE_RELATIONSHIPS':
      return {
        ...state,
        nodes: state.nodes
          .filter(
            (node) =>
              !action.relationshipSpecs.some(
                (spec) => spec.removeNodeId === node.id
              )
          )
          .map((node) => {
            const spec = action.relationshipSpecs.find(
              (spec) => spec.addPropertiesNodeId === node.id
            );
            if (spec) {
              let augmentedNode = node;
              for (const [key, value] of Object.entries(spec.properties)) {
                augmentedNode = setProperty(augmentedNode, key, value);
              }
              return augmentedNode;
            } else {
              return node;
            }
          }),
        relationships: state.relationships.filter(
          (relationship) =>
            !action.relationshipSpecs.some(
              (spec) =>
                spec.removeNodeId === relationship.fromId ||
                spec.removeNodeId === relationship.toId
            )
        ),
      };

    case 'GETTING_GRAPH_SUCCEEDED':
      return action.storedGraph;

    default:
      return state;
  }
};

export default undoable(graph, {
  filter: (action) => action.category === 'GRAPH',
  groupBy: groupByActionTypes('MOVE_NODES'),
});