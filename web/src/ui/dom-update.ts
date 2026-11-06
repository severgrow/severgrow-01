/** Publish presentation changes only when they changed. Root attribute/style writes invalidate
 * inherited styles and wake observers across the game, even when the turn is unchanged. */
export function setData(el:HTMLElement,key:string,value:string):void{
  if(el.dataset[key]!==value)el.dataset[key]=value;
}
export function setStyle(el:HTMLElement,key:string,value:string):void{
  if(el.style.getPropertyValue(key)!==value)el.style.setProperty(key,value);
}
