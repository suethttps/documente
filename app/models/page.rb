class Page < ApplicationRecord
  belongs_to :parent, class_name: "Page", optional: true
  belongs_to :author, class_name: "User", optional: true
  has_many :children, class_name: "Page", foreign_key: :parent_id, dependent: nil, inverse_of: :parent

  # Avisa todos os clientes conectados que a árvore de páginas mudou.
  after_commit -> { ActionCable.server.broadcast("pages", { type: "pages-changed" }) }

  # Ao excluir, as subpáginas sobem um nível (herdam o pai da página excluída).
  before_destroy -> { children.update_all(parent_id: parent_id) }

  def public_attributes
    {
      id: id,
      title: title,
      parentId: parent_id,
      createdAt: created_at,
      updatedAt: updated_at,
      author: author&.slice(:id, :name, :color)
    }
  end

  def export_filename
    slug = title.to_s.parameterize
    "#{slug.presence || 'pagina'}.md"
  end

  def export_markdown
    "# #{title.presence || 'Sem título'}\n\n#{markdown}"
  end
end
