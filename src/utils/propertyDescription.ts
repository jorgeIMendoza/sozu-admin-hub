/**
 * Concatenates property description with model description
 * Property description comes first, then model description
 * If both exist, they are separated by a line break
 * If only property description exists, no line break is added
 */
export const getCombinedDescription = (
  propertyDescription?: string | null,
  modelDescription?: string | null
): string => {
  const propDesc = propertyDescription?.trim();
  const modelDesc = modelDescription?.trim();

  if (propDesc && modelDesc) {
    return `${propDesc}\n${modelDesc}`;
  }
  
  if (propDesc) {
    return propDesc;
  }
  
  if (modelDesc) {
    return modelDesc;
  }
  
  return '';
};