import { connect } from 'react-redux';
import {
  setProperty,
  setNodeCaption,
  setRelationshipType,
  setType,
  renameProperty,
  removeProperty,
  setArrowsProperty,
  removeArrowsProperty,
  reverseRelationships,
  duplicateSelection,
  convertCaptionsToPropertyValues,
  mergeOnPropertyValues,
  mergeNodes,
  deleteSelection,
  setExamples,
  setCardinality,
  setDescription,
  onSaveOntology,
} from '../actions/graph';
import DetailInspector from '../components/DetailInspector';
import { getSelectedNodes } from '@neo4j-arrows/selectors';
import { getOntologies, getPresentGraph } from '../selectors';
import { toggleSelection } from '../actions/selection';
import { Dispatch } from 'redux';
import {
  Attribute,
  Cardinality,
  CustomCardinality,
  Entity,
  EntitySelection,
  Ontology,
  RelationshipType,
} from '@neo4j-arrows/model';
import { ArrowsState } from '../reducers';

const mapStateToProps = (state: ArrowsState) => {
  const graph = getPresentGraph(state);
  const ontologies = getOntologies(state);
  return {
    graph,
    cachedImages: state.cachedImages,
    selection: state.selection,
    selectedNodes: getSelectedNodes({ ...state, graph }),
    inspectorVisible: state.applicationLayout.inspectorVisible,
    ontologies,
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => {
  return {
    onSaveCaption: (selection: EntitySelection, caption: string) => {
      dispatch(setNodeCaption(selection, caption));
    },
    onConvertCaptionsToPropertyValues: () => {
      dispatch(convertCaptionsToPropertyValues());
    },
    onSaveExamples: (selection: EntitySelection, examples: string[]) => {
      dispatch(setExamples(selection, examples));
    },
    onSaveType: (selection: EntitySelection, type: string) => {
      dispatch(setType(selection, type));
    },
    onSaveRelationshipType: (
      selection: EntitySelection,
      relationshipType: RelationshipType
    ) => {
      dispatch(setRelationshipType(selection, relationshipType));
    },
    onMergeOnValues: (selection: EntitySelection, propertyKey: string) => {
      dispatch(mergeOnPropertyValues(selection, propertyKey));
    },
    onSavePropertyKey: (
      selection: EntitySelection,
      oldPropertyKey: string,
      newPropertyKey: string
    ) => {
      dispatch(renameProperty(selection, oldPropertyKey, newPropertyKey));
    },
    onSavePropertyValue: (
      selection: EntitySelection,
      key: string,
      value: Attribute
    ) => {
      dispatch(setProperty(selection, key, value));
    },
    onSaveArrowsPropertyValue: (
      selection: EntitySelection,
      key: string,
      value: string
    ) => {
      dispatch(setArrowsProperty(selection, key, value));
    },
    onDeleteProperty: (selection: EntitySelection, key: string) => {
      dispatch(removeProperty(selection, key));
    },
    onDeleteArrowsProperty: (selection: EntitySelection, key: string) => {
      dispatch(removeArrowsProperty(selection, key));
    },
    onDuplicate: () => {
      dispatch(duplicateSelection());
    },
    onDelete: () => {
      dispatch(deleteSelection());
    },
    reverseRelationships: (selection: EntitySelection) => {
      dispatch(reverseRelationships(selection));
    },
    mergeNodes: (selection: EntitySelection) => {
      dispatch(mergeNodes(selection));
    },
    onSelect: (entities: Pick<Entity, 'id' | 'entityType'>[]) => {
      dispatch(toggleSelection(entities, 'replace'));
    },
    onSaveOntology: (selection: EntitySelection, ontologies: Ontology[]) =>
      onSaveOntology(selection, ontologies)(dispatch),
    onSaveCardinality: (
      selection: EntitySelection,
      cardinality: Cardinality,
      customCardinality?: CustomCardinality
    ) => {
      dispatch(setCardinality(selection, cardinality, customCardinality));
    },
    onSaveDescription: (selection: EntitySelection, description: string) => {
      dispatch(setDescription(selection, description));
    },
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(DetailInspector);
