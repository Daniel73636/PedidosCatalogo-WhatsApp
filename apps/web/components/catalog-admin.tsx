"use client";
import { useCallback, useEffect, useState } from "react";
import { api, money, type Product } from "@/lib/api";
export function CatalogAdmin() {
  const [products,setProducts]=useState<Product[]>([]); const [error,setError]=useState("");
  const load=useCallback(()=>api<Product[]>("/v1/products",undefined,true).then(setProducts).catch((e:Error)=>setError(e.message)),[]);
  useEffect(()=>{void load()},[load]);
  const toggle=async(id:string)=>{await api(`/v1/products/${id}/sold-out`,{method:"POST"},true);await load()};
  return <><div className="section-title"><div><div className="eyebrow">Menú público</div><h1>Catálogo</h1></div><button className="btn">+ Nuevo producto</button></div>{error&&<div className="banner">{error}</div>}<table className="table"><thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{products.map(product=><tr key={product.id}><td><strong>{product.name}</strong></td><td>{money(product.basePriceCents)}</td><td>{product.stockQty??"—"}</td><td><span className="chip">{product.status}</span></td><td><button className={`btn ${product.status==="sold_out"?"success":"secondary"}`} onClick={()=>void toggle(product.id)}>{product.status==="sold_out"?"Reactivar":"Agotar"}</button></td></tr>)}</tbody></table></>;
}
