class PagesController < ApplicationController
  before_action :set_page, only: %i[ update destroy export ]

  def index
    pages = Page.order(:created_at).includes(:author)
    render json: { pages: pages.map(&:public_attributes) }
  end

  def create
    parent_id = params[:parentId].presence
    if parent_id && !Page.exists?(parent_id)
      return render json: { error: "Página pai não existe." }, status: :bad_request
    end
    page = Page.create!(title: params[:title].to_s, parent_id: parent_id, author: Current.user)
    render json: { page: page.public_attributes }, status: :created
  end

  def update
    data = {}
    data[:title] = params[:title].to_s if params.key?(:title)
    data[:parent_id] = params[:parentId].presence if params.key?(:parentId)
    @page.update!(data)
    render json: { page: @page.public_attributes }
  end

  def destroy
    @page.destroy!
    render json: { ok: true }
  end

  # Baixa a página como arquivo .md (sempre com o conteúdo mais recente).
  def export
    send_data @page.export_markdown,
      filename: @page.export_filename,
      type: "text/markdown; charset=utf-8",
      disposition: "attachment"
  end

  private
    def set_page
      @page = Page.find_by(id: params[:id])
      render json: { error: "Página não encontrada." }, status: :not_found unless @page
    end
end
