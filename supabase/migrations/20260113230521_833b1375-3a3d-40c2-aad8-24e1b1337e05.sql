-- Drop existing constraint and add new one with inverse types
ALTER TABLE legislation_relations 
DROP CONSTRAINT IF EXISTS legislation_relations_relation_type_check;

ALTER TABLE legislation_relations 
ADD CONSTRAINT legislation_relations_relation_type_check 
CHECK (relation_type IN (
  'revogado', 
  'revogacao_parcial', 
  'alteracao', 
  'transposicao', 
  'regulamentacao',
  'revogado_por',
  'revogado_parcialmente_por',
  'alterado_por',
  'transposto_por',
  'regulamentado_por'
));