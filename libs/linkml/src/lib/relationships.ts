import { Relationship, Node, Cardinality } from '@neo4j-arrows/model';
import { toAnnotators } from './ontologies';
import { Attribute, LinkMLClass, SpiresCoreClasses } from './types';
import { toClassName } from './naming';
import { propertiesToAttributes } from './entities';

enum RelationshipMember {
  SUBJECT = 'subject',
  OBJECT = 'object',
}

const toMinimumCardinality = (
  relationship: Relationship,
  relationshipMember: RelationshipMember
): number => {
  switch (relationship.cardinality) {
    case Cardinality.CUSTOM:
      switch (relationshipMember) {
        case RelationshipMember.SUBJECT:
          return relationship.customCardinality?.subject_minimum ?? 0;
        case RelationshipMember.OBJECT:
          return relationship.customCardinality?.object_minimum ?? 0;
      }
      break;
    default:
      return 0;
  }
};

const toMaximumCardinality = (
  relationship: Relationship,
  relationshipMember: RelationshipMember
): number | undefined => {
  switch (relationship.cardinality) {
    case Cardinality.CUSTOM:
      switch (relationshipMember) {
        case RelationshipMember.SUBJECT:
          return relationship.customCardinality?.subject_maximum;
        case RelationshipMember.OBJECT:
          return relationship.customCardinality?.object_maximum;
      }
      break;
    case Cardinality.ONE_TO_ONE:
      return 1;
    case Cardinality.ONE_TO_MANY:
      return relationshipMember === RelationshipMember.SUBJECT ? 1 : undefined;
    case Cardinality.MANY_TO_ONE:
      return relationshipMember === RelationshipMember.OBJECT ? 1 : undefined;
    default:
      return undefined;
  }
};

export const findRelationshipsFromNodeFactory = (
  relationship: Relationship[]
): ((node: Node) => Relationship[]) => {
  return (node: Node): Relationship[] =>
    relationship.filter((relationship) => relationship.fromId === node.id);
};

export const relationshipToRelationshipClass = (
  relationship: Relationship,
  nodeIdToNode: (id: string) => Node | undefined,
  toRelationshipClassName: (relationship: Relationship) => string
): LinkMLClass => {
  const nodeToTripleSlot = (
    node: Node | undefined,
    relationshipMember: RelationshipMember
  ): Attribute => {
    if (!node) {
      return {};
    }

    return {
      range: toClassName(node.caption),
      annotations: {
        'prompt.examples': node.examples ? node.examples.join(', ') : '',
      },
      ...{
        minimum_cardinality: toMinimumCardinality(
          relationship,
          relationshipMember
        ),
        maximum_cardinality: toMaximumCardinality(
          relationship,
          relationshipMember
        ),
      },
    };
  };

  const fromNode = nodeIdToNode(relationship.fromId);
  const toNode = nodeIdToNode(relationship.toId);

  return {
    is_a: SpiresCoreClasses.Triple,
    description: `A triple${
      fromNode ? ` where the subject is a ${fromNode.caption}` : ''
    }${fromNode && toNode ? ' and' : ''}${
      toNode ? ` where the object is a ${toNode.caption}` : ''
    }${relationship.description ? `. ${relationship.description}` : ''}`,
    slot_usage: {
      subject: nodeToTripleSlot(fromNode, RelationshipMember.SUBJECT),
      object: nodeToTripleSlot(toNode, RelationshipMember.OBJECT),
      predicate: {
        range: `${toRelationshipClassName(relationship)}Predicate`,
        annotations: {
          'prompt.examples': relationship.examples
            ? relationship.examples.join(', ')
            : '',
        },
      },
      ...propertiesToAttributes(relationship.properties),
    },
  };
};

export const relationshipToPredicateClass = (
  relationship: Relationship,
  toRelationshipClassName: (relationship: Relationship) => string
): LinkMLClass => {
  const relationshipOntologies = relationship.ontologies ?? [];

  return {
    is_a: SpiresCoreClasses.RelationshipType,
    attributes: {
      label: {
        description: `The predicate for the ${toRelationshipClassName(
          relationship
        )} relationships.`,
      },
    },
    id_prefixes: relationshipOntologies.map((ontology) =>
      ontology.id.toLocaleUpperCase()
    ),
    annotations: relationshipOntologies.length
      ? {
          annotators: toAnnotators(relationshipOntologies),
        }
      : {},
  };
};
