import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ProductSchema = defineTable({
    client: v.id("clients"),
    name: v.string(),        // "Pizza Muzza" o "Consulta Cardiológica"
    description: v.optional(v.string()),
    price: v.number(),       // Precio base (informativo para la IA)
    isActive: v.boolean(),
    category: v.optional(v.string()), // "Bebidas", "Entradas"
    isAvailable: v.boolean(), 
}).index("by_client", ["client"]);