import { createCategory } from "./category.create.service.js";
import { deleteCategory } from "./category.delete.service.js";
import { listCategories } from "./category.list.service.js";
import { updateCategory } from "./category.update.service.js";

export default class CategoryService {
  static list = listCategories;
  static create = createCategory;
  static update = updateCategory;
  static delete = deleteCategory;
}
