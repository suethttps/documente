class CreatePages < ActiveRecord::Migration[8.1]
  def change
    create_table :pages do |t|
      t.string :title, null: false, default: ""
      t.references :parent, foreign_key: { to_table: :pages }
      t.references :author, foreign_key: { to_table: :users }
      t.binary :ydoc # snapshot CRDT (Yjs) do conteúdo
      t.text :markdown, null: false, default: "" # conteúdo exportado em Markdown

      t.timestamps
    end
  end
end
